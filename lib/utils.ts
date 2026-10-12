import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function truncate(value: string, size = 5) { return `${value.slice(0, size)}…${value.slice(-size)}`; }
export function explorerUrl(signature: string) { return `https://solscan.io/tx/${encodeURIComponent(signature)}?cluster=devnet`; }
export function addressUrl(address: string) { return `https://solscan.io/account/${encodeURIComponent(address)}?cluster=devnet`; }

export const GITHUB_URL = "https://github.com/muhamed-kanapiya/whisperpay";
export const DEMO_WARNING = "DEMO WALLET — Devnet only — Stored in browser — Do not send real funds";
