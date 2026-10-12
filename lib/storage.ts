import { Keypair } from "@solana/web3.js";
import { validAddress } from "./parseIntent";
import type { Activity, Contact, MintRecord } from "./types";

export const STORAGE = { key: "whisperpay_key", contacts: "whisperpay_contacts", history: "whisperpay_history", mint: "whisperpay_mint" } as const;

export function readWallet(): Keypair | null {
  const raw = localStorage.getItem(STORAGE.key);
  if (!raw) return null;
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length !== 64 || !values.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw new Error("The saved demo wallet is damaged. Reset it to create a new Devnet wallet.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(values));
}

export function save<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error("Browser storage is unavailable or full. Allow local storage before using this demo wallet."); }
}

function read(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function readContacts(): Contact[] {
  const data = read(STORAGE.contacts);
  if (!Array.isArray(data)) return [];
  return data.filter((v): v is Contact => !!v && typeof v.name === "string" && typeof v.address === "string" && validAddress(v.address));
}

export function readHistory(): Activity[] {
  const data = read(STORAGE.history);
  if (!Array.isArray(data)) return [];
  return data.filter((v): v is Activity => !!v && typeof v.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v.signature) && ["send", "airdrop", "mint"].includes(v.kind) && ["SOL", "USDC", "WHISPER"].includes(v.token) && ["pending", "confirmed", "failed"].includes(v.status) && typeof v.amount === "number" && Number.isFinite(v.amount) && typeof v.createdAt === "number").slice(0, 50);
}

export function readMint(wallet: string): MintRecord | null {
  const data = read(STORAGE.mint) as Partial<MintRecord> | null;
  return data && data.wallet === wallet && typeof data.address === "string" && validAddress(data.address) ? data as MintRecord : null;
}

export function resetStorage() { Object.values(STORAGE).forEach(key => localStorage.removeItem(key)); }
