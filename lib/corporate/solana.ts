import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { AuthorityType, ExtensionType, MINT_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createBurnCheckedInstruction, createInitializeMintInstruction, createInitializeNonTransferableMintInstruction, createInitializePermanentDelegateInstruction, createMintToCheckedInstruction, createSetAuthorityInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, getMintLen, getNonTransferable, getPermanentDelegate, unpackAccount, unpackMint } from "@solana/spl-token";
import { Buffer } from "buffer";
import { connection } from "../solana";
import { ACTIONS, INITIAL_UNITS, assertActionOrder, calculateEntitlements, snapshotJson, type CorporateAction, type Instrument, type Snapshot } from "./model";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const SETUP_STEPS = ["bond", "cash", "holder-0", "holder-1", "holder-2", "seal"] as const;
export const ALL_OPERATIONS = [...SETUP_STEPS, ...ACTIONS.flatMap(a => [`snapshot-${a}`, a])];
export const BOND_PROGRAM = TOKEN_2022_PROGRAM_ID;
export const CASH_PROGRAM = TOKEN_PROGRAM_ID;
export const TREASURY_SUPPLY = 100_000n * 1_000_000n;
const key = (value: string) => new PublicKey(value);
export const bondAccount = (instrument: Instrument, holder: string) => getAssociatedTokenAddressSync(key(instrument.bondMint), key(holder), false, BOND_PROGRAM);
export const cashAccount = (instrument: Instrument, holder: string) => getAssociatedTokenAddressSync(key(instrument.cashMint), key(holder), false, CASH_PROGRAM);

export async function digest(value: string) {
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function termsJson(instrument: Instrument) {
  return JSON.stringify({ version: 1, id: instrument.id, issuer: instrument.issuer, bondMint: instrument.bondMint, cashMint: instrument.cashMint,
    createdAt: instrument.createdAt, maturityAt: instrument.maturityAt, face: "1000000000", couponBps: 1000, frequency: 2,
    partialBps: 2000, holders: instrument.holders.map(h => ({ address: h.address, initialUnits: h.initialUnits })) });
}
export function memo(issuer: PublicKey, text: string) {
  return new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: issuer, isSigner: true, isWritable: false }], data: Buffer.from(text, "utf8") });
}
export async function markerAddress(instrument: Instrument, operation: string) {
  if (!ALL_OPERATIONS.includes(operation)) throw new Error("Unknown corporate operation.");
  // 16-character instrument ID plus a short operation code stays under the 32-byte seed limit.
  const seed = `${instrument.id}:${ALL_OPERATIONS.indexOf(operation)}`;
  return { seed, address: await PublicKey.createWithSeed(key(instrument.issuer), seed, MEMO_PROGRAM) };
}
async function markerInstruction(instrument: Instrument, operation: string) {
  const { seed, address } = await markerAddress(instrument, operation);
  if (await connection.getAccountInfo(address, "confirmed")) throw new Error("An on-chain receipt already exists for this operation. Refresh before continuing.");
  return SystemProgram.createAccountWithSeed({ fromPubkey: key(instrument.issuer), basePubkey: key(instrument.issuer), seed,
    newAccountPubkey: address, lamports: await connection.getMinimumBalanceForRentExemption(0), space: 0, programId: MEMO_PROGRAM });
}

export async function newInstrument(issuer: PublicKey): Promise<Instrument> {
  const id = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");
  const slot = await connection.getSlot("finalized");
  const time = await connection.getBlockTime(slot);
  if (time === null) throw new Error("Solana did not return a timestamp. Try again.");
  return { version: 1, id, issuer: issuer.toBase58(),
    bondMint: (await PublicKey.createWithSeed(issuer, `${id}:bond`, BOND_PROGRAM)).toBase58(),
    cashMint: (await PublicKey.createWithSeed(issuer, `${id}:cash`, CASH_PROGRAM)).toBase58(),
    createdAt: time, maturityAt: time + 180,
    holders: INITIAL_UNITS.map((initialUnits, i) => ({ name: ["Investor A", "Investor B", "Investor C"][i], address: Keypair.generate().publicKey.toBase58(), initialUnits })),
    receipts: {}, snapshots: {},
  };
}

export async function buildSetup(instrument: Instrument, operation: typeof SETUP_STEPS[number]) {
  const payer = key(instrument.issuer), bond = key(instrument.bondMint), cash = key(instrument.cashMint);
  const prior = SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(operation));
  await requireMarkers(instrument, prior);
  if (operation !== "bond") await verifyTerms(instrument, "confirmed");
  const tx = new Transaction().add(await markerInstruction(instrument, operation));
  if (operation === "bond") {
    const space = getMintLen([ExtensionType.NonTransferable, ExtensionType.PermanentDelegate]);
    tx.add(SystemProgram.createAccountWithSeed({ fromPubkey: payer, basePubkey: payer, seed: `${instrument.id}:bond`, newAccountPubkey: bond,
      lamports: await connection.getMinimumBalanceForRentExemption(space), space, programId: BOND_PROGRAM }),
    createInitializeNonTransferableMintInstruction(bond, BOND_PROGRAM),
    createInitializePermanentDelegateInstruction(bond, payer, BOND_PROGRAM),
    createInitializeMintInstruction(bond, 0, payer, null, BOND_PROGRAM));
  } else if (operation === "cash") {
    const treasury = cashAccount(instrument, instrument.issuer);
    tx.add(SystemProgram.createAccountWithSeed({ fromPubkey: payer, basePubkey: payer, seed: `${instrument.id}:cash`, newAccountPubkey: cash,
      lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE), space: MINT_SIZE, programId: CASH_PROGRAM }),
    createInitializeMintInstruction(cash, 6, payer, null, CASH_PROGRAM),
    createAssociatedTokenAccountIdempotentInstruction(payer, treasury, payer, cash, CASH_PROGRAM),
    createMintToCheckedInstruction(cash, treasury, payer, TREASURY_SUPPLY, 6, [], CASH_PROGRAM),
    createSetAuthorityInstruction(cash, payer, AuthorityType.MintTokens, null, [], CASH_PROGRAM));
  } else if (operation.startsWith("holder-")) {
    const holder = instrument.holders[Number(operation.slice(-1))];
    const owner = key(holder.address), account = bondAccount(instrument, holder.address);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, account, owner, bond, BOND_PROGRAM),
      createMintToCheckedInstruction(bond, account, payer, BigInt(holder.initialUnits), 0, [], BOND_PROGRAM),
      createAssociatedTokenAccountIdempotentInstruction(payer, cashAccount(instrument, holder.address), owner, cash, CASH_PROGRAM));
  } else {
    const registry = await readRegistry(instrument, false);
    if (registry.units.some((amount, i) => amount !== BigInt(instrument.holders[i].initialUnits))) throw new Error("Issued balances do not match the registry.");
    tx.add(createSetAuthorityInstruction(bond, payer, AuthorityType.MintTokens, null, [], BOND_PROGRAM));
  }
  return tx.add(memo(payer, `WPCA1:${operation}:${await digest(termsJson(instrument))}`));
}

export async function requireMarker(instrument: Instrument, operation: string, commitment: "confirmed" | "finalized" = "confirmed") {
  await requireMarkers(instrument, [operation], commitment);
}
async function requireMarkers(instrument: Instrument, operations: readonly string[], commitment: "confirmed" | "finalized" = "confirmed") {
  if (!operations.length) return;
  const addresses = await Promise.all(operations.map(async operation => (await markerAddress(instrument, operation)).address));
  const infos = await connection.getMultipleAccountsInfo(addresses, commitment);
  infos.forEach((info, index) => {
    if (!info || !info.owner.equals(MEMO_PROGRAM) || info.data.length !== 0) throw new Error(`Waiting for the ${operations[index]} receipt on Solana. Refresh after confirmation.`);
  });
}

export async function readRegistry(instrument: Instrument, sealed = true) {
  const addresses = [key(instrument.bondMint), key(instrument.cashMint), ...instrument.holders.map(h => bondAccount(instrument, h.address)), cashAccount(instrument, instrument.issuer), ...instrument.holders.map(h => cashAccount(instrument, h.address))];
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: "finalized" });
  if (value.some(info => !info)) throw new Error("The instrument is not finalized yet. Wait a few seconds, then refresh.");
  const bond = unpackMint(addresses[0], value[0], BOND_PROGRAM);
  const cash = unpackMint(addresses[1], value[1], CASH_PROGRAM);
  if (!bond.isInitialized || bond.decimals !== 0 || !getNonTransferable(bond) || !getPermanentDelegate(bond)?.delegate.equals(key(instrument.issuer)) || bond.freezeAuthority !== null ||
    (sealed ? bond.mintAuthority !== null : !bond.mintAuthority?.equals(key(instrument.issuer)))) throw new Error("Bond authority or token extension verification failed.");
  if (!cash.isInitialized || cash.decimals !== 6 || cash.mintAuthority !== null || cash.freezeAuthority !== null || cash.supply !== TREASURY_SUPPLY) throw new Error("Test settlement mint verification failed.");
  const units = instrument.holders.map((holder, i) => {
    const account = unpackAccount(addresses[i + 2], value[i + 2], BOND_PROGRAM);
    if (!account.owner.equals(key(holder.address)) || !account.mint.equals(key(instrument.bondMint)) || account.isFrozen) throw new Error("Holder account verification failed.");
    return account.amount;
  });
  if (units.reduce((sum, amount) => sum + amount, 0n) !== bond.supply) throw new Error("The registry does not account for the entire bond supply.");
  const cashOwners = [instrument.issuer, ...instrument.holders.map(h => h.address)];
  const cashBalances = cashOwners.map((owner, i) => {
    const account = unpackAccount(addresses[i + 5], value[i + 5], CASH_PROGRAM);
    if (!account.isInitialized || account.isFrozen || !account.owner.equals(key(owner)) || !account.mint.equals(key(instrument.cashMint))) throw new Error("Settlement account verification failed.");
    return account.amount;
  });
  const [treasury, ...paid] = cashBalances;
  const blockTime = await connection.getBlockTime(context.slot);
  if (blockTime === null) throw new Error("The record-date block timestamp is unavailable.");
  return { slot: context.slot, blockTime, units, treasury, paid, supply: bond.supply };
}

export async function captureSnapshot(instrument: Instrument, action: CorporateAction): Promise<Snapshot> {
  await verifyTerms(instrument, "finalized");
  await requireMarkers(instrument, ["seal", ...ACTIONS.slice(0, ACTIONS.indexOf(action))], "finalized");
  const registry = await readRegistry(instrument);
  assertActionOrder(action, instrument.receipts, registry.blockTime, instrument.maturityAt);
  const expected = instrument.holders.map(h => BigInt(h.initialUnits) * (action === "redemption" ? 8n : 10n) / 10n);
  if (registry.units.some((units, i) => units !== expected[i])) throw new Error("Unexpected bond quantities. This fixed demo lifecycle cannot continue.");
  return { version: 1, instrument: instrument.bondMint, action, slot: registry.slot, blockTime: registry.blockTime,
    holders: instrument.holders.map((holder, i) => ({ address: holder.address, units: registry.units[i].toString() })) };
}

export async function snapshotMemo(instrument: Instrument, snapshot: Snapshot) {
  return `WPCA1:snapshot-${snapshot.action}:${await digest(termsJson(instrument))}:${await digest(snapshotJson(snapshot))}`;
}
async function verifyMemoReceipt(instrument: Instrument, operation: string, expected: string, commitment: "confirmed" | "finalized") {
  const receipt = instrument.receipts[operation];
  if (!receipt || receipt.status !== "confirmed") throw new Error(`Confirm ${operation} before continuing.`);
  const transaction = await connection.getParsedTransaction(receipt.signature, { commitment, maxSupportedTransactionVersion: 0 });
  const { address } = await markerAddress(instrument, operation);
  if (!transaction || transaction.meta?.err || !transaction.transaction.message.accountKeys.some(k => k.pubkey.equals(key(instrument.issuer)) && k.signer) ||
    !transaction.transaction.message.accountKeys.some(k => k.pubkey.equals(address)) ||
    !transaction.transaction.message.instructions.some(instruction => instruction.programId.equals(MEMO_PROGRAM) && "parsed" in instruction && instruction.parsed === expected)) {
    throw new Error(`The ${commitment} on-chain ${operation} receipt does not match this audit. Wait for confirmation or restore the original export.`);
  }
  await requireMarker(instrument, operation, commitment);
}
export async function verifyTerms(instrument: Instrument, commitment: "confirmed" | "finalized" = "finalized") {
  const payer = key(instrument.issuer);
  if (!(await PublicKey.createWithSeed(payer, `${instrument.id}:bond`, BOND_PROGRAM)).equals(key(instrument.bondMint)) ||
    !(await PublicKey.createWithSeed(payer, `${instrument.id}:cash`, CASH_PROGRAM)).equals(key(instrument.cashMint))) throw new Error("Instrument mint addresses do not match the issuer and ID.");
  await verifyMemoReceipt(instrument, "bond", `WPCA1:bond:${await digest(termsJson(instrument))}`, commitment);
}
export async function buildSnapshot(instrument: Instrument, snapshot: Snapshot) {
  const fresh = await captureSnapshot(instrument, snapshot.action);
  if (snapshot.instrument !== instrument.bondMint || snapshot.slot > fresh.slot || snapshot.blockTime > fresh.blockTime ||
    JSON.stringify(snapshot.holders) !== JSON.stringify(fresh.holders)) throw new Error("The record-date review no longer matches the holder registry.");
  return new Transaction().add(await markerInstruction(instrument, `snapshot-${snapshot.action}`), memo(key(instrument.issuer), await snapshotMemo(instrument, snapshot)));
}

export async function verifySnapshot(instrument: Instrument, snapshot: Snapshot) {
  if (snapshot.instrument !== instrument.bondMint || snapshot.holders.length !== 3 || snapshot.holders.some((holder, i) => holder.address !== instrument.holders[i].address)) throw new Error("Snapshot does not belong to this instrument.");
  const receipt = instrument.receipts[`snapshot-${snapshot.action}`];
  if (!receipt || receipt.status !== "confirmed") throw new Error("Anchor the record-date snapshot before settlement.");
  const expected = await snapshotMemo(instrument, snapshot);
  await verifyMemoReceipt(instrument, `snapshot-${snapshot.action}`, expected, "finalized");
}

export async function buildSettlement(instrument: Instrument, action: CorporateAction) {
  await verifyTerms(instrument);
  const snapshot = instrument.snapshots[action];
  if (!snapshot) throw new Error("Capture a record-date snapshot first.");
  await verifySnapshot(instrument, snapshot);
  await requireMarkers(instrument, ["seal", ...ACTIONS.slice(0, ACTIONS.indexOf(action))], "finalized");
  const registry = await readRegistry(instrument);
  assertActionOrder(action, instrument.receipts, registry.blockTime, instrument.maturityAt);
  if (registry.units.some((units, i) => units.toString() !== snapshot.holders[i].units)) throw new Error("Holdings changed after the record date. Settlement is blocked; investigate the discrepancy.");
  const rows = calculateEntitlements(action, snapshot.holders);
  const total = rows.reduce((sum, row) => sum + row.total, 0n);
  if (registry.treasury < total) throw new Error("The test settlement treasury is underfunded.");
  const payer = key(instrument.issuer), tx = new Transaction().add(await markerInstruction(instrument, action));
  for (const row of rows) {
    tx.add(createTransferCheckedInstruction(cashAccount(instrument, instrument.issuer), key(instrument.cashMint), cashAccount(instrument, row.address), payer, row.total, 6, [], CASH_PROGRAM));
    if (row.burn > 0n) tx.add(createBurnCheckedInstruction(bondAccount(instrument, row.address), key(instrument.bondMint), payer, row.burn, 0, [], BOND_PROGRAM));
  }
  // Transfers, burns and the replay marker are atomic. The memo commits the exact eligibility input.
  return tx.add(memo(payer, `WPCA1:${action}:${await digest(snapshotJson(snapshot))}`));
}

export async function reconcileReceipts(instrument: Instrument): Promise<Instrument> {
  const entries = Object.entries(instrument.receipts).filter(([, receipt]) => receipt.status === "pending");
  if (!entries.length) return instrument;
  const { value } = await connection.getSignatureStatuses(entries.map(([, receipt]) => receipt.signature), { searchTransactionHistory: true });
  const height = await connection.getBlockHeight("finalized");
  const receipts = { ...instrument.receipts };
  entries.forEach(([operation, receipt], index) => {
    const status = value[index];
    if (status?.err) receipts[operation] = { ...receipt, status: "failed" };
    else if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") receipts[operation] = { ...receipt, status: "confirmed" };
    else if (!status && height > receipt.lastValidBlockHeight) receipts[operation] = { ...receipt, status: "failed" };
  });
  return { ...instrument, receipts };
}
