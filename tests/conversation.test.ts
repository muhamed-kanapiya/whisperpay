import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { paymentTurn, revisePayment } from "../lib/conversation";
import { isConfirmation, parseIntent, readOnlyCommand, resolveIntent } from "../lib/parseIntent";

describe("guided payment conversation", () => {
  it("asks for amount, token and recipient without inventing a field", () => {
    const start = paymentTurn("Make a payment");
    expect(start.intent).toBeUndefined();
    expect(start.prompt).toContain("How much");
    const amount = paymentTurn("five", start.draft);
    expect(amount.draft).toEqual({ amount: "5", token: undefined });
    expect(amount.prompt).toContain("Which token");
    const asset = paymentTurn("USDC", amount.draft);
    expect(asset.intent).toBeUndefined();
    expect(asset.prompt).toContain("Who should");
    const recipient = paymentTurn("Alice", asset.draft);
    expect(recipient.intent).toEqual({ action: "send", amount: 5, token: "USDC", recipient: "Alice" });
    expect(isConfirmation("Alice")).toBe(false);
  });
  it("accepts an amount and asset together and retains an earlier recipient", () => {
    const start = paymentTurn("send to mom");
    expect(start.draft).toEqual({ recipient: "mom" });
    expect(paymentTurn("zero point one SOL", start.draft).intent).toMatchObject({ amount: .1, token: "SOL", recipient: "mom" });
  });
  it("keeps a chosen asset when the next answer provides only an amount", () => {
    const start = paymentTurn("send USDC to alice");
    expect(paymentTurn("five", start.draft).intent).toMatchObject({ amount: 5, token: "USDC", recipient: "alice" });
  });
  it("revalidates precision when a later answer supplies the asset", () => {
    const start = paymentTurn("send 0.000000001 to mom");
    expect(() => paymentTurn("USDC", start.draft)).toThrow("decimal");
    expect(paymentTurn("SOL", start.draft).intent?.amount).toBe(.000000001);
  });
  it("starts a new payment without accidentally reusing old fields", () => {
    expect(paymentTurn("send five USDC", { amount: "1", token: "SOL", recipient: "mom" }).draft).toEqual({ amount: "5", token: "USDC" });
    expect(paymentTurn("make a payment", { amount: "1", token: "SOL" }).draft).toEqual({});
  });
  it("preserves a pasted address exactly", () => {
    const recipient = Keypair.generate().publicKey.toBase58();
    expect(paymentTurn(recipient, { amount: "0.1", token: "SOL" }).intent?.recipient).toBe(recipient);
  });
  it.each(["send -1 SOL to mom", "send -five SOL to mom", "send 0 SOL to mom", "send all SOL to mom", "send five dollars to mom", "send 0.1000000001 SOL to mom"])("rejects invalid amounts or unsupported assets: %s", text => {
    expect(() => paymentTurn(text)).toThrow();
  });
  it("doesn't infer a contact from a similar sounding name or a compound command", () => {
    const contacts = [{ name: "mom", address: Keypair.generate().publicKey.toBase58() }];
    for (const text of ["send 1 SOL to mum", "send 1 SOL to mom and confirm", "send 1 SOL to mom and send 2 SOL to alice"]) {
      const turn = paymentTurn(text);
      expect(() => resolveIntent(turn.intent!, contacts)).toThrow("No contact");
      expect(isConfirmation(text)).toBe(false);
    }
  });
  it("never completes a missing recipient with approval", () => {
    for (const text of ["confirm", "yes"]) expect(() => paymentTurn(text, { amount: "1", token: "SOL" })).toThrow("recipient");
  });
  it("resolves a recipient correction again instead of keeping the old address", () => {
    const contacts = ["mom", "alice"].map(name => ({ name, address: Keypair.generate().publicKey.toBase58() }));
    const previous = resolveIntent(parseIntent("send .1 SOL to mom"), contacts);
    const next = revisePayment("change recipient to alice", previous)!;
    expect(resolveIntent(next, contacts).address).toBe(contacts[1].address);
    expect(previous.address).toBe(contacts[0].address);
    expect(revisePayment("confirm", previous)).toBeNull();
    expect(() => revisePayment("use USDC and confirm", previous)).toThrow();
  });
  it("rechecks precision for an asset correction", () => {
    const previous = { ...parseIntent("send .000000001 SOL to mom"), address: Keypair.generate().publicKey.toBase58() };
    expect(() => revisePayment("use USDC", previous)).toThrow("decimal");
    expect(revisePayment("use SOL", previous)?.amount).toBe(.000000001);
  });
});

describe("more forgiving voice wording", () => {
  it.each([
    ["Could you send mom half a SOL?", .5, "SOL"],
    ["I'd like to pay twenty-five USDC to mom please", 25, "USDC"],
    ["Please send point five soul to mom", .5, "SOL"],
    ["Send 0 point 0 5 sole to mom", .05, "SOL"],
    ["Pay five U.S.D.C. to mom", 5, "USDC"],
    ["Transfer a quarter SOL to mom", .25, "SOL"],
    ["Send zero point oh five SOL to mom", .05, "SOL"],
  ])("understands %s", (text, amount, token) => {
    expect(parseIntent(String(text))).toMatchObject({ amount, token, recipient: "mom" });
  });
  it("keeps questions and polite wording out of approval", () => {
    expect(readOnlyCommand("How much do I have?")).toBe("balance");
    expect(readOnlyCommand("Could you show my contacts?")).toBe("contacts");
    for (const text of ["could you confirm", "don't send", "please send", "confirm and send", "yes but change the amount"]) expect(isConfirmation(text)).toBe(false);
  });
});
