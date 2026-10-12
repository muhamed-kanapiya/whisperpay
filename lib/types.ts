export type Token = "SOL" | "USDC" | "WHISPER";
export type Intent = { action: "send"; amount: number; token: Token; recipient: string };
export type Contact = { name: string; address: string };
export type ResolvedIntent = Intent & { address: string };
export type Activity = {
  signature: string;
  kind: "send" | "airdrop" | "mint";
  amount: number;
  token: Token;
  recipient?: string;
  address?: string;
  createdAt: number;
  status: "pending" | "confirmed" | "failed";
  lastValidBlockHeight?: number;
};
export type MintRecord = { address: string; wallet: string };
export type TransferQuote = { feeLamports: number; rentLamports: number; totalSolLamports: number; remainingSolLamports: number; checkedAt: number };
