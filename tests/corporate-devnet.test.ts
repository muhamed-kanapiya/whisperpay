/** Opt-in integration test. Uses only a dedicated, locally generated Devnet issuer. */
import fs from "node:fs";
import { Keypair, Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { connection, sendTransaction } from "../lib/solana";
import { ACTIONS, CASH_SCALE, calculateEntitlements, type Instrument } from "../lib/corporate/model";
import { MEMO_PROGRAM, SETUP_STEPS, buildSetup, buildSnapshot, buildSettlement, captureSnapshot, markerAddress, newInstrument, readRegistry, reconcileReceipts, requireMarker } from "../lib/corporate/solana";
import { validateInstrument } from "../lib/corporate/storage";

const live = process.env.WHISPERPAY_TEST_DEVNET === "1";
const folder = "test-results/corporate";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
describe.skipIf(!live)("funded Devnet corporate lifecycle", () => {
  it("issues, snapshots, pays coupons, redeems partially and retires all remaining bonds", async () => {
    fs.mkdirSync(folder, { recursive: true });
    const keyPath = `${folder}/devnet-test-key.json`;
    const payer = fs.existsSync(keyPath) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf8")))) : Keypair.generate();
    if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, JSON.stringify(Array.from(payer.secretKey)));
    console.log("Isolated Devnet issuer:", payer.publicKey.toBase58());
    if (await connection.getBalance(payer.publicKey) < 50_000_000) throw new Error(`Fund ${payer.publicKey.toBase58()} with 0.1 Devnet SOL. Never use mainnet funds.`);
    const auditPath = `${folder}/devnet-audit.json`;
    let instrument: Instrument = fs.existsSync(auditPath) ? validateInstrument(JSON.parse(fs.readFileSync(auditPath, "utf8")), payer.publicKey.toBase58()) : await newInstrument(payer.publicKey);
    const persist = () => fs.writeFileSync(auditPath, JSON.stringify(instrument, null, 2));
    instrument = await reconcileReceipts(instrument); persist();
    const execute = async (operation: string, transaction: Transaction) => {
      transaction.feePayer = payer.publicKey; transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
      const bytes = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
      expect(bytes).toBeLessThanOrEqual(1232);
      console.log(`Sending ${operation}: ${bytes} bytes`);
      await sendTransaction(transaction, payer, (signature, lastValidBlockHeight) => {
        instrument.receipts[operation] = { signature, lastValidBlockHeight: lastValidBlockHeight!, status: "pending" }; persist();
      });
      instrument.receipts[operation].status = "confirmed"; persist();
      console.log(`Confirmed ${operation}: ${instrument.receipts[operation].signature}`);
      for (let tries = 0; ; tries++) {
        try { await requireMarker(instrument, operation, "finalized"); break; }
        catch (error) { if (tries >= 20) throw error; await delay(2000); }
      }
      // Stay below the free shared RPC's burst limit across the full scripted lifecycle.
      await delay(8000);
    };
    for (const step of SETUP_STEPS) if (instrument.receipts[step]?.status !== "confirmed") await execute(step, await buildSetup(instrument, step));
    let previousCash = [0n, 0n, 0n];
    for (const action of ACTIONS) {
      if (instrument.receipts[action]?.status === "confirmed") { previousCash = (await readRegistry(instrument)).paid; continue; }
      if (action === "redemption") {
        while ((await readRegistry(instrument)).blockTime < instrument.maturityAt) await delay(4000);
      }
      if (instrument.receipts[`snapshot-${action}`]?.status !== "confirmed") {
        const snapshot = await captureSnapshot(instrument, action); instrument.snapshots[action] = snapshot; persist();
        await execute(`snapshot-${action}`, await buildSnapshot(instrument, snapshot));
      }
      const expected = calculateEntitlements(action, instrument.snapshots[action]!.holders);
      await execute(action, await buildSettlement(instrument, action));
      const registry = await readRegistry(instrument);
      expect(registry.paid).toEqual(expected.map((row, i) => previousCash[i] + row.total));
      expect(registry.units).toEqual(expected.map(row => row.units - row.burn));
      previousCash = registry.paid;
      await expect(buildSettlement(instrument, action)).rejects.toThrow();
    }
    const final = await readRegistry(instrument);
    expect(final.supply).toBe(0n);
    expect(final.paid).toEqual([10_900n, 21_800n, 32_700n].map(amount => amount * CASH_SCALE));
    expect(final.treasury).toBe(34_600n * CASH_SCALE);
    const { address, seed } = await markerAddress(instrument, "redemption");
    const replay = new Transaction().add(SystemProgram.createAccountWithSeed({ fromPubkey: payer.publicKey, basePubkey: payer.publicKey, seed, newAccountPubkey: address,
      lamports: await connection.getMinimumBalanceForRentExemption(0), space: 0, programId: MEMO_PROGRAM }));
    const replayResult = await connection.simulateTransaction(replay, [payer]);
    expect(replayResult.value.err).toEqual({ InstructionError: [0, { Custom: 0 }] });
    expect(replayResult.value.logs?.some(log => /already in use/i.test(log))).toBe(true);
    fs.writeFileSync(`${folder}/devnet-result.json`, JSON.stringify({ issuer: payer.publicKey.toBase58(), bondMint: instrument.bondMint, cashMint: instrument.cashMint, slot: final.slot, supply: String(final.supply), paid: final.paid.map(String), treasury: String(final.treasury), signatures: Object.fromEntries(Object.entries(instrument.receipts).map(([op, receipt]) => [op, receipt.signature])) }, null, 2));
    console.log("Verified: zero remaining bond supply; 65,400 testUSD paid; on-chain replay simulation rejected at instruction 0.");
  }, 600_000);
});
