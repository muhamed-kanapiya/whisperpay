import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey, SystemInstruction } from "@solana/web3.js";
import { AuthorityType, decodeSetAuthorityInstruction, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { ACTIONS, CASH_SCALE, INITIAL_UNITS, assertActionOrder, calculateEntitlements, corporateCommand, nextAction, snapshotJson, type Instrument, type Receipt } from "../lib/corporate/model";
import { ALL_OPERATIONS, BOND_PROGRAM, CASH_PROGRAM, MEMO_PROGRAM, buildSetup, digest, markerAddress, newInstrument, reconcileReceipts, termsJson, verifySnapshot, verifyTerms } from "../lib/corporate/solana";
import { validateInstrument } from "../lib/corporate/storage";
import { connection } from "../lib/solana";

afterEach(() => vi.restoreAllMocks());
const holders = INITIAL_UNITS.map((units, i) => ({ address: `holder-${i}`, units: String(units) }));
const confirmed: Receipt = { signature: "1".repeat(88), lastValidBlockHeight: 900, status: "confirmed" };
describe("corporate entitlement accounting", () => {
  it("matches KASE's 10-bond semi-annual example exactly", () => {
    const rows = calculateEntitlements("coupon", holders);
    expect(rows.map(r => r.total / CASH_SCALE)).toEqual([500n, 1000n, 1500n]);
    expect(rows.every(r => r.burn === 0n)).toBe(true);
  });
  it("settles partial principal and final principal plus coupon without double-counting", () => {
    const partial = calculateEntitlements("partial", holders);
    expect(partial.map(r => r.burn)).toEqual([2n, 4n, 6n]);
    expect(partial.reduce((s, r) => s + r.principal, 0n)).toBe(12_000n * CASH_SCALE);
    const final = calculateEntitlements("redemption", partial.map(r => ({ address: r.address, units: String(r.units - r.burn) })));
    expect(final.map(r => r.total / CASH_SCALE)).toEqual([8400n, 16800n, 25200n]);
    expect(final.reduce((s, r) => s + r.principal, 0n) + partial.reduce((s, r) => s + r.principal, 0n)).toBe(60_000n * CASH_SCALE);
    expect(final.reduce((s, r) => s + r.burn, 0n)).toBe(48n);
  });
  it.each(["-1", "1.5", "1e1", "100000000000000000000", "NaN"])("rejects invalid quantities: %s", units => {
    expect(() => calculateEntitlements("coupon", [{ address: "A", units }])).toThrow();
  });
  it("rejects duplicate holders and fractional partial burns", () => {
    expect(() => calculateEntitlements("coupon", [holders[0], holders[0]])).toThrow("registry");
    expect(() => calculateEntitlements("partial", [{ address: "A", units: "1" }])).toThrow("rounding");
  });
  it("blocks out-of-order, pending, duplicate and premature actions", () => {
    const receipts = { seal: confirmed };
    expect(nextAction(receipts)).toBe("coupon");
    expect(() => assertActionOrder("partial", receipts, 1000, 900)).toThrow("prior");
    expect(() => assertActionOrder("coupon", { ...receipts, coupon: confirmed }, 1000, 900)).toThrow("already");
    expect(() => assertActionOrder("coupon", { ...receipts, bond: { ...confirmed, status: "pending" } }, 1000, 900)).toThrow("pending");
    expect(() => assertActionOrder("redemption", { ...receipts, coupon: confirmed, partial: confirmed }, 899, 900)).toThrow("maturity");
    expect(() => assertActionOrder("redemption", { ...receipts, coupon: confirmed, partial: confirmed }, 900, 900)).not.toThrow();
  });
  it("never interprets voice as authority to sign", () => {
    expect(corporateCommand("Prepare coupon.")).toBe("coupon");
    expect(corporateCommand("show holders")).toBe("holders");
    expect(corporateCommand("confirm")).toBeNull();
    expect(corporateCommand("send all the funds")).toBeNull();
  });
});

async function instrumentFixture(): Promise<Instrument> {
  vi.spyOn(connection, "getSlot").mockResolvedValue(100);
  vi.spyOn(connection, "getBlockTime").mockResolvedValue(1_800_000_000);
  return newInstrument(Keypair.generate().publicKey);
}
async function mockMemoProof(instrument: Instrument, operation: string, parsed: string) {
  const { address } = await markerAddress(instrument, operation);
  vi.spyOn(connection, "getAccountInfo").mockResolvedValue({ data: Buffer.alloc(0), executable: false, lamports: 890880, owner: MEMO_PROGRAM, rentEpoch: 0 });
  vi.spyOn(connection, "getMultipleAccountsInfo").mockImplementation(async keys => keys.map(() => ({ data: Buffer.alloc(0), executable: false, lamports: 890880, owner: MEMO_PROGRAM, rentEpoch: 0 })));
  vi.spyOn(connection, "getParsedTransaction").mockResolvedValue({
    meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: new PublicKey(instrument.issuer), signer: true }, { pubkey: address, signer: false }], instructions: [{ programId: MEMO_PROGRAM, parsed }] } },
  } as unknown as Awaited<ReturnType<typeof connection.getParsedTransaction>>);
}
describe("Solana corporate receipts and issuance", () => {
  it("creates non-transferable bonds with permanent issuer burn authority", async () => {
    const instrument = await instrumentFixture();
    vi.spyOn(connection, "getAccountInfo").mockResolvedValue(null);
    vi.spyOn(connection, "getMinimumBalanceForRentExemption").mockResolvedValue(3_000_000);
    const tx = await buildSetup(instrument, "bond");
    const marker = SystemInstruction.decodeCreateWithSeed(tx.instructions[0]);
    expect(marker.programId.equals(MEMO_PROGRAM)).toBe(true);
    expect(marker.space).toBe(0);
    const mint = SystemInstruction.decodeCreateWithSeed(tx.instructions[1]);
    expect(mint.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(tx.instructions[2].data[0]).toBe(32); // InitializeNonTransferableMint
    expect(tx.instructions[3].data[0]).toBe(35); // InitializePermanentDelegate
    expect(tx.instructions[3].data.subarray(1).equals(new PublicKey(instrument.issuer).toBuffer())).toBe(true);
    tx.feePayer = new PublicKey(instrument.issuer); tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
    expect(tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length).toBeLessThanOrEqual(1232);
  });
  it("uses distinct durable replay markers for every action and instrument", async () => {
    const instrument = await instrumentFixture();
    const markers = await Promise.all(ALL_OPERATIONS.map(op => markerAddress(instrument, op)));
    expect(new Set(markers.map(m => m.address.toBase58())).size).toBe(ALL_OPERATIONS.length);
    expect(markers.every(m => Buffer.byteLength(m.seed) <= 32)).toBe(true);
    expect((await markerAddress({ ...instrument, id: "a".repeat(16) }, "coupon")).address.equals((await markerAddress(instrument, "coupon")).address)).toBe(false);
  });
  it("blocks an already-created operation before building a second transaction", async () => {
    const instrument = await instrumentFixture();
    vi.spyOn(connection, "getAccountInfo").mockResolvedValue({ data: Buffer.alloc(0), executable: false, lamports: 890880, owner: MEMO_PROGRAM, rentEpoch: 0 });
    await expect(buildSetup(instrument, "bond")).rejects.toThrow("already exists");
  });
  it("checks immutable issue terms against the signed on-chain memo", async () => {
    const instrument = await instrumentFixture(); instrument.receipts.bond = confirmed;
    await mockMemoProof(instrument, "bond", `WPCA1:bond:${await digest(termsJson(instrument))}`);
    await expect(verifyTerms(instrument)).resolves.toBeUndefined();
    await expect(verifyTerms({ ...instrument, maturityAt: instrument.maturityAt + 1 })).rejects.toThrow("does not match");
  });
  it("rejects modified snapshot eligibility even when the local status says confirmed", async () => {
    const instrument = await instrumentFixture(); instrument.receipts["snapshot-coupon"] = confirmed;
    const snapshot = { version: 1 as const, action: ACTIONS[0], instrument: instrument.bondMint, slot: 101, blockTime: instrument.createdAt + 1, holders: instrument.holders.map(h => ({ address: h.address, units: String(h.initialUnits) })) };
    await mockMemoProof(instrument, "snapshot-coupon", `WPCA1:snapshot-coupon:${await digest(termsJson(instrument))}:${await digest(snapshotJson(snapshot))}`);
    await expect(verifySnapshot(instrument, snapshot)).resolves.toBeUndefined();
    await expect(verifySnapshot(instrument, { ...snapshot, holders: snapshot.holders.map(h => ({ ...h, units: "60" })) })).rejects.toThrow("does not match");
  });
  it("keeps unknown transactions pending until expiry, and reconciles actual success/failure", async () => {
    const instrument = await instrumentFixture();
    instrument.receipts = { bond: { ...confirmed, status: "pending" }, cash: { ...confirmed, status: "pending" }, seal: { ...confirmed, status: "pending" } };
    vi.spyOn(connection, "getSignatureStatuses").mockResolvedValue({ context: { slot: 100 }, value: [{ slot: 99, confirmations: 1, err: null, confirmationStatus: "confirmed" }, { slot: 99, confirmations: 1, err: { InstructionError: [0, "InvalidArgument"] }, confirmationStatus: "confirmed" }, null] });
    vi.spyOn(connection, "getBlockHeight").mockResolvedValue(899);
    expect(Object.values((await reconcileReceipts(instrument)).receipts).map(r => r.status)).toEqual(["confirmed", "failed", "pending"]);
    vi.mocked(connection.getBlockHeight).mockResolvedValue(901);
    expect((await reconcileReceipts(instrument)).receipts.seal.status).toBe("failed");
  });
  it("rejects audit imports for another wallet or malformed fixture allocation", async () => {
    const instrument = await instrumentFixture();
    expect(validateInstrument(instrument, instrument.issuer)).toEqual(instrument);
    expect(() => validateInstrument(instrument, Keypair.generate().publicKey.toBase58())).toThrow("issuer");
    expect(() => validateInstrument({ ...instrument, holders: instrument.holders.map(h => ({ ...h, initialUnits: 100 })) }, instrument.issuer)).toThrow("format");
  });
});
