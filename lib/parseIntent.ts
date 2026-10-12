import { PublicKey } from "@solana/web3.js";
import type { Contact, Intent, ResolvedIntent, Token } from "./types";

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

export function amountDigits(text: string): string {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return text;
  let normalized = text.toLowerCase().replace(/(?<=[a-z])-(?=[a-z])/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:a |one )?half(?: a)?$/.test(normalized)) return "0.5";
  if (/^(?:a |one )?quarter(?: a)?$/.test(normalized)) return "0.25";
  if (normalized.startsWith("point ")) normalized = "zero " + normalized;
  const parts = normalized.split(" point ");
  if (parts.length > 2) throw new Error(PARSE_ERROR);
  const whole = /^\d+$/.test(parts[0]) ? Number(parts[0]) : spokenInteger(parts[0]);
  if (parts.length === 1) return String(whole);
  const decimals = parts[1].split(" ").flatMap(word => /^\d+$/.test(word) ? word.split("").map(Number) : [word === "oh" ? 0 : small.indexOf(word)]);
  if (decimals.some(digit => digit < 0 || digit > 9)) throw new Error("Say each digit after ‘point’, such as ‘one point two five’.");
  return `${whole}.${decimals.join("")}`;
}

export function cleanCommand(text: string): string {
  return text.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ")
    .replace(/^(?:(?:hey |hi )?whisperpay[, ]+)?(?:(?:can|could|would) you |i(?:'|’)d like to |i want to |help me )?(?:please )?/i, "")
    .replace(/,? please$/i, "");
}

export const TOKEN_PATTERN = "(?:solana|sol|soul|sole|u\\.?\\s*s\\.?\\s*d\\.?\\s*c\\.?|whisper)";
export function parseToken(text: string): Token | null {
  const symbol = text.trim().replace(/[.\s]/g, "").toUpperCase();
  if (["SOL", "SOLANA", "SOUL", "SOLE"].includes(symbol)) return "SOL";
  if (symbol === "USDC" || symbol === "WHISPER") return symbol;
  return null;
}

export function paymentAmount(text: string, token: Token): number {
  const amountText = amountDigits(text);
  const amount = Number(amountText);
  const decimals = token === "SOL" ? 9 : 6;
  const [whole = "0", fraction = ""] = amountText.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const exactUnits = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
  if (toBaseUnits(amount, decimals) !== exactUnits) throw new Error("That amount cannot be represented exactly. Try a smaller amount.");
  return amount;
}

/** Flexible wording, but never fuzzy-match a recipient or infer a currency. */
export function parseIntent(text: string): Intent {
  const cleaned = cleanCommand(text);
  const standard = cleaned.match(new RegExp(`^(?:send|transfer|pay) (.+?) (${TOKEN_PATTERN}) to (.+)$`, "i"));
  const recipientFirst = standard ? null : cleaned.match(new RegExp(`^(?:send|transfer|pay) (.+?) (.+?) (${TOKEN_PATTERN})$`, "i"));
  const amount = standard?.[1] ?? recipientFirst?.[2];
  const token = parseToken(standard?.[2] ?? recipientFirst?.[3] ?? "");
  const recipient = standard?.[3] ?? recipientFirst?.[1];
  if (!amount || !token || !recipient) throw new Error(PARSE_ERROR);
  return { action: "send", amount: paymentAmount(amount, token), token, recipient };
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
export function isCancellation(text: string) { return /^(cancel(?: payment| that)?|no|stop|never mind|nevermind)[.!]?$/i.test(text.trim()); }

export function commandForIntent(intent: Intent): string {
  const amount = intent.amount.toFixed(intent.token === "SOL" ? 9 : 6).replace(/0+$/, "").replace(/\.$/, "");
  return `send ${amount} ${intent.token} to ${intent.recipient}`;
}

export function readOnlyCommand(text: string): "balance" | "contacts" | "help" | null {
  const command = cleanCommand(text);
  if (/^(?:(?:what is|what's|show|check) (?:my |the )?)?balances?$/i.test(command)) return "balance";
  if (/^(?:how much (?:do i have|(?:sol|usdc|whisper) do i have)|what do i have|how much is in my wallet)$/i.test(command)) return "balance";
  if (/^(?:(?:show|list) (?:my )?)?contacts$/i.test(command)) return "contacts";
  if (/^(help|what can i say|what can you do)$/i.test(command)) return "help";
  return null;
}

/** Corrections create another review; they can never authorize a transfer. */
export function reviseAmount(text: string, previous: ResolvedIntent): ResolvedIntent | null {
  const match = cleanCommand(text).match(/^(?:change (?:the )?amount to|make (?:that|it)) (.+)$/i);
  if (!match) return null;
  const amount = match[1].replace(new RegExp(`\\s+${previous.token}$`, "i"), "");
  const intent = parseIntent(`send ${amount} ${previous.token} to ${previous.recipient}`);
  return { ...previous, amount: intent.amount };
}
