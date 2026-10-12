import { PublicKey } from "@solana/web3.js";
import type { Contact, Intent, ResolvedIntent } from "./types";

export const PARSE_ERROR = "Try ‘Send 0.1 SOL to mom’, ‘Pay 5 USDC to alice’, or ‘What is my balance?’";

const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function spokenInteger(text: string): number {
  const direct = small.indexOf(text);
  if (direct >= 0) return direct;
  const words = text.split(" ");
  const ten = tens.indexOf(words[0]);
  if (ten >= 0 && (words.length === 1 || (words.length === 2 && small.indexOf(words[1]) > 0 && small.indexOf(words[1]) < 10))) return (ten + 2) * 10 + (words.length === 2 ? small.indexOf(words[1]) : 0);
  const hundred = text.match(/^(one|two|three|four|five|six|seven|eight|nine) hundred(?: (?:and )?(.+))?$/);
  if (hundred) {
    const remainder = hundred[2] ? spokenInteger(hundred[2]) : 0;
    if (remainder < 100) return small.indexOf(hundred[1]) * 100 + remainder;
  }
  throw new Error("Use a clear amount, such as ‘twenty five’ or ‘zero point one’.");
}

function amountDigits(text: string): string {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return text;
  const normalized = text.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const parts = normalized.split(" point ");
  if (parts.length > 2) throw new Error(PARSE_ERROR);
  const whole = spokenInteger(parts[0]);
  if (parts.length === 1) return String(whole);
  const decimals = parts[1].split(" ").map(word => small.indexOf(word));
  if (decimals.some(digit => digit < 0 || digit > 9)) throw new Error("Say each digit after ‘point’, such as ‘one point two five’.");
  return `${whole}.${decimals.join("")}`;
}

/** Conservative grammar: no partial commands, guessed addresses, or inferred amounts. */
export function parseIntent(text: string): Intent {
  const cleaned = text.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  const match = cleaned.match(/^(?:please\s+)?(?:send|transfer|pay)\s+(.+?)\s+(sol|solana|u\s*s\s*d\s*c|whisper)\s+to\s+(.+)$/i);
  if (!match) throw new Error(PARSE_ERROR);
  const amountText = amountDigits(match[1]);
  const amount = Number(amountText);
  const symbol = match[2].replace(/\s/g, "").toUpperCase();
  const token = symbol === "WHISPER" ? "WHISPER" : symbol === "USDC" ? "USDC" : "SOL";
  const decimals = token === "SOL" ? 9 : 6;
  const [whole = "0", fraction = ""] = amountText.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const exactUnits = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
  if (toBaseUnits(amount, decimals) !== exactUnits) throw new Error("That amount cannot be represented exactly. Try a smaller amount.");
  return { action: "send", amount, token, recipient: match[3].trim() };
}

/** Decimal string arithmetic avoids silently rounding a transfer's amount. */
export function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
  // Expand scientific notation only for very small values (e.g. one lamport).
  const text = amount.toString().includes("e-") ? amount.toFixed(20).replace(/0+$/, "") : amount.toString();
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("That amount is too large.");
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const units = BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units <= 0n) throw new Error("The amount is smaller than the minimum transferable unit.");
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("That amount is too large.");
  return units;
}

export function validAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}

export function resolveIntent(intent: Intent, contacts: Contact[]): ResolvedIntent {
  const contact = contacts.find(item => item.name.toLowerCase() === intent.recipient.toLowerCase());
  if (contact && validAddress(contact.address)) return { ...intent, recipient: contact.name, address: contact.address };
  if (validAddress(intent.recipient)) return { ...intent, address: intent.recipient };
  throw new Error(`No contact named “${intent.recipient}”. Add their address to Contacts, or use a full, exact Solana address.`);
}

export function isConfirmation(text: string) { return /^(confirm|yes|send)[.!]?$/i.test(text.trim()); }
export function isCancellation(text: string) { return /^(cancel|no|stop)[.!]?$/i.test(text.trim()); }

export function commandForIntent(intent: Intent): string {
  const amount = intent.amount.toFixed(intent.token === "SOL" ? 9 : 6).replace(/0+$/, "").replace(/\.$/, "");
  return `send ${amount} ${intent.token} to ${intent.recipient}`;
}

export function readOnlyCommand(text: string): "balance" | "contacts" | "help" | null {
  const command = text.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  if (/^(?:(?:what is|what's|show|check) (?:my |the )?)?balances?$/i.test(command)) return "balance";
  if (/^(?:(?:show|list) (?:my )?)?contacts$/i.test(command)) return "contacts";
  if (/^(help|what can i say)$/i.test(command)) return "help";
  return null;
}

/** Corrections create another review; they can never authorize a transfer. */
export function reviseAmount(text: string, previous: ResolvedIntent): ResolvedIntent | null {
  const match = text.trim().replace(/[.!?]+$/, "").match(/^(?:change (?:the )?amount to|make (?:that|it)) (.+)$/i);
  if (!match) return null;
  const amount = match[1].replace(new RegExp(`\\s+${previous.token}$`, "i"), "");
  const intent = parseIntent(`send ${amount} ${previous.token} to ${previous.recipient}`);
  return { ...previous, amount: intent.amount };
}
