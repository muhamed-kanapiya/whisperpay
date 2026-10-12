import { PublicKey } from "@solana/web3.js";
import { ALL_OPERATIONS } from "./solana";
import { ACTIONS, INITIAL_UNITS, type Instrument } from "./model";

export const CORPORATE_STORAGE_KEY = "whisperpay_corporate_v1";
const isAddress = (value: unknown) => { try { return typeof value === "string" && new PublicKey(value).toBase58() === value; } catch { return false; } };
export function validateInstrument(value: unknown, issuer: string): Instrument {
  if (!value || typeof value !== "object") throw new Error("Invalid corporate action audit file.");
  const d = value as Instrument;
  if (d.version !== 1 || !/^[a-f0-9]{16}$/.test(d.id) || d.issuer !== issuer || ![d.issuer, d.bondMint, d.cashMint].every(isAddress) ||
    !Number.isSafeInteger(d.createdAt) || d.createdAt <= 0 || d.maturityAt !== d.createdAt + 180 || !Array.isArray(d.holders) || d.holders.length !== 3 ||
    new Set(d.holders.map(h => h.address)).size !== 3 || d.holders.some((h, i) => !isAddress(h.address) || h.initialUnits !== INITIAL_UNITS[i] || typeof h.name !== "string" || h.name.length > 40) ||
    !d.receipts || typeof d.receipts !== "object" || !d.snapshots || typeof d.snapshots !== "object") throw new Error("This audit file does not match the current demo issuer or instrument format.");
  for (const [operation, receipt] of Object.entries(d.receipts)) {
    if (!ALL_OPERATIONS.includes(operation) || !receipt || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(receipt.signature) || !["pending", "confirmed", "failed"].includes(receipt.status) || !Number.isSafeInteger(receipt.lastValidBlockHeight)) throw new Error("Invalid transaction receipt.");
  }
  for (const [action, snapshot] of Object.entries(d.snapshots)) {
    if (!ACTIONS.includes(action as typeof ACTIONS[number]) || !snapshot || snapshot.version !== 1 || snapshot.action !== action || snapshot.instrument !== d.bondMint ||
      !Number.isSafeInteger(snapshot.slot) || !Number.isSafeInteger(snapshot.blockTime) || snapshot.blockTime < d.createdAt || !Array.isArray(snapshot.holders) || snapshot.holders.length !== 3 ||
      snapshot.holders.some((h, i) => h.address !== d.holders[i].address || !/^\d{1,2}$/.test(h.units))) throw new Error("Invalid record-date snapshot.");
  }
  return d;
}
export function readInstrument(issuer: string): Instrument | null {
  const raw = localStorage.getItem(CORPORATE_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed.issuer !== issuer) return null;
  return validateInstrument(parsed, issuer);
}
export function saveInstrument(instrument: Instrument) {
  localStorage.setItem(CORPORATE_STORAGE_KEY, JSON.stringify(instrument));
}
