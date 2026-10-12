import { PublicKey } from "@solana/web3.js";
import { parseIntent, validAddress } from "./parseIntent";
import type { Intent } from "./types";

export type PaymentRequest = Intent & { token: "SOL" | "USDC" };

export function validateRequest(amount: string, token: string, recipient: string): PaymentRequest {
  if (token !== "SOL" && token !== "USDC") throw new Error("Payment requests support SOL or Devnet USDC.");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(amount)) throw new Error("Enter a positive numeric amount.");
  if (!validAddress(recipient) || !PublicKey.isOnCurve(new PublicKey(recipient).toBytes())) throw new Error("This payment request has an invalid wallet address.");
  return parseIntent(`send ${amount} ${token} to ${recipient}`) as PaymentRequest;
}

export function paymentRequestUrl(origin: string, amount: string, token: string, recipient: string): string {
  const request = validateRequest(amount, token, recipient);
  const url = new URL("/app/", origin);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS app URL.");
  url.search = new URLSearchParams({ network: "devnet", to: request.recipient, amount, token: request.token }).toString();
  return url.toString();
}

export function readPaymentRequest(params: URLSearchParams): PaymentRequest | null {
  if (!params.has("to") && !params.has("network") && !params.has("amount") && !params.has("token")) return null;
  for (const key of ["network", "to", "amount", "token"]) if (params.getAll(key).length !== 1) throw new Error("Incomplete or ambiguous payment request.");
  if (params.get("network") !== "devnet") throw new Error("Only Solana Devnet payment requests are supported.");
  return validateRequest(params.get("amount")!, params.get("token")!, params.get("to")!);
}
