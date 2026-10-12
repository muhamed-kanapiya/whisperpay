import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { isCancellation, isConfirmation, parseIntent, readOnlyCommand, resolveIntent, reviseAmount, toBaseUnits, validAddress } from "../lib/parseIntent";

describe("voice payment intent", () => {
  it("supports explicit USDC and natural amounts without guessing currencies", () => {
    expect(parseIntent("pay twenty-five USDC to Alice")).toMatchObject({ amount: 25, token: "USDC", recipient: "Alice" });
    expect(parseIntent("send one hundred and five U S D C to mom").amount).toBe(105);
    expect(parseIntent("pay five point two five USDC to alice").amount).toBe(5.25);
    expect(() => parseIntent("pay twenty dollars to alice")).toThrow();
    expect(() => parseIntent("send one two USDC to alice")).toThrow();
  });
  it("keeps balance queries and corrections separate from authorization", () => {
    expect(readOnlyCommand("What's my balance?")).toBe("balance");
    expect(readOnlyCommand("Show contacts")).toBe("contacts");
    expect(readOnlyCommand("send all my balance")).toBeNull();
    const prior = { action: "send" as const, amount: 5, token: "USDC" as const, recipient: "mom", address: Keypair.generate().publicKey.toBase58() };
    expect(reviseAmount("Change amount to twenty five USDC", prior)).toEqual({ ...prior, amount: 25 });
    expect(prior.amount).toBe(5);
    expect(() => reviseAmount("make it five and confirm", prior)).toThrow();
    expect(() => reviseAmount("change amount to 2 SOL", prior)).toThrow();
    expect(isConfirmation("make it five")).toBe(false);
    expect(reviseAmount("confirm", prior)).toBeNull();
  });
  it("parses the requested SOL command", () => {
    expect(parseIntent("send 0.1 sol to mom")).toEqual({ action: "send", amount: .1, token: "SOL", recipient: "mom" });
  });
  it("accepts speech punctuation, case, whitespace, and spoken decimals", () => {
    expect(parseIntent(" Please send zero point zero five SOL to Mom. ")).toEqual({ action: "send", amount: .05, token: "SOL", recipient: "Mom" });
    expect(parseIntent("TRANSFER 25 WHISPER to Alice!").token).toBe("WHISPER");
    expect(parseIntent("Send .1 SOL to mom").amount).toBe(.1);
  });
  it.each(["send -1 sol to mom", "send 0 SOL to mom", "send 1 BTC to mom", "send 1 sol to", "send 1 SOL to mom and send 2 SOL to alice", "send 1e5 SOL to mom", "send NaN SOL to mom", "send 0.0000000001 SOL to mom", "send 0.0000001 WHISPER to mom"])("rejects unsafe or ambiguous command: %s", command => {
    expect(() => resolveIntent(parseIntent(command), [{ name: "mom", address: Keypair.generate().publicKey.toBase58() }])).toThrow();
  });
  it("preserves case of real base58 addresses", () => {
    const address = Keypair.generate().publicKey.toBase58();
    expect(resolveIntent(parseIntent(`send 0.1 sol to ${address}`), []).address).toBe(address);
  });
  it("resolves contacts case-insensitively and never guesses unknown contacts", () => {
    const address = Keypair.generate().publicKey.toBase58();
    expect(resolveIntent(parseIntent("send 1 SOL to MOM"), [{ name: "mom", address }]).address).toBe(address);
    expect(() => resolveIntent(parseIntent("send 1 SOL to alice"), [{ name: "mom", address }])).toThrow("No contact");
    expect(validAddress("0".repeat(44))).toBe(false);
    expect(validAddress("a".repeat(44))).toBe(false);
  });
  it("requires an exact, separate confirmation utterance", () => {
    for (const text of ["confirm", "YES", "send!"]) expect(isConfirmation(text)).toBe(true);
    for (const text of ["don't confirm", "yes no", "send 1 SOL to mom", "confirm and send", "yesterday"]) expect(isConfirmation(text)).toBe(false);
    expect(isCancellation("Cancel.")).toBe(true);
  });
});

describe("exact transfer amounts", () => {
  it("converts without floating-point multiplication drift", () => {
    expect(toBaseUnits(.1, 9)).toBe(100_000_000n);
    expect(toBaseUnits(.000000001, 9)).toBe(1n);
    expect(toBaseUnits(.000001, 6)).toBe(1n);
    expect(toBaseUnits(1.234567, 6)).toBe(1_234_567n);
    expect(toBaseUnits(.29, 9)).toBe(290_000_000n);
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE, Number.MIN_VALUE])("rejects invalid amount %s", amount => expect(() => toBaseUnits(amount, 9)).toThrow());
  it("never silently rounds excess precision", () => {
    expect(() => toBaseUnits(.0000000001, 9)).toThrow("decimal places");
    expect(() => toBaseUnits(1.0000001, 6)).toThrow("decimal places");
    expect(() => parseIntent("send 0.10000000000000000001 SOL to mom")).toThrow("decimal places");
  });
});
