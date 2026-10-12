import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { paymentRequestUrl, readPaymentRequest } from "../lib/payment-request";
import { commandForIntent, parseIntent } from "../lib/parseIntent";

const address = Keypair.generate().publicKey.toBase58();
describe("untrusted payment request links", () => {
  it("keeps GitHub Pages requests under the repository path", () => {
    const url = new URL(paymentRequestUrl("https://muhamed-kanapiya.github.io", "5", "USDC", address, "/whisperpay"));
    expect(url.pathname).toBe("/whisperpay/app/");
    expect(readPaymentRequest(url.searchParams)?.recipient).toBe(address);
  });
  it("keeps tiny SOL and USDC requests usable without scientific notation", () => {
    for (const [amount, token] of [["0.000000001", "SOL"], ["0.000001", "USDC"], ["100", "SOL"]]) {
      const url = new URL(paymentRequestUrl("https://whisperpay.example", amount, token, address));
      const request = readPaymentRequest(url.searchParams)!;
      expect(parseIntent(commandForIntent(request))).toEqual(request);
    }
  });
  it("round-trips exact addresses and USDC amounts without a send action", () => {
    const url = new URL(paymentRequestUrl("https://whisperpay.example", "25.000001", "USDC", address));
    expect(url.pathname).toBe("/app/");
    expect(readPaymentRequest(url.searchParams)).toEqual({ action: "send", amount: 25.000001, token: "USDC", recipient: address });
    expect(url.searchParams.has("confirm")).toBe(false);
  });
  it.each(["mainnet-beta", "mainnet", ""])("refuses the wrong or absent network: %s", network => {
    const params = new URLSearchParams({ network, to: address, token: "SOL", amount: ".1" });
    expect(() => readPaymentRequest(params)).toThrow("Devnet");
  });
  it("rejects duplicate fields, unsupported mints, invalid addresses and excess precision", () => {
    const url = new URL(paymentRequestUrl("https://whisperpay.example", "1", "SOL", address));
    url.searchParams.append("to", Keypair.generate().publicKey.toBase58());
    expect(() => readPaymentRequest(url.searchParams)).toThrow("ambiguous");
    expect(() => paymentRequestUrl("https://example.com", "1", "WHISPER", address)).toThrow("support");
    expect(() => paymentRequestUrl("https://example.com", "1", "USDC", "mom")).toThrow("address");
    expect(() => paymentRequestUrl("https://example.com", "1.0000001", "USDC", address)).toThrow("decimal");
    expect(() => paymentRequestUrl("https://example.com", "0", "SOL", address)).toThrow();
    expect(() => paymentRequestUrl("https://example.com", "1e3", "SOL", address)).toThrow();
  });
  it("does not mistake a normal command URL for a request", () => {
    expect(readPaymentRequest(new URLSearchParams("command=send+1+SOL+to+mom"))).toBeNull();
    expect(() => readPaymentRequest(new URLSearchParams("to=" + address))).toThrow("Incomplete");
  });
});
