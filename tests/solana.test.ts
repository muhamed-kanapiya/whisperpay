import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { ACCOUNT_SIZE, AccountLayout, AuthorityType, decodeMintToInstruction, decodeSetAuthorityInstruction, decodeTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildTransfer, buildWhisperMint, connection, estimateTransfer, friendlyError, getSplBalance, sendTransaction, TransactionFailedError, TransactionPendingError, USDC_DEVNET_MINT } from "../lib/solana";

afterEach(() => vi.restoreAllMocks());
const payer = Keypair.generate();
const recipient = Keypair.generate().publicKey;

describe("actionable RPC errors", () => {
  it("preserves balance errors mentioning a network fee", () => {
    const message = "Not enough SOL. Leave some Devnet SOL for the network fee.";
    expect(friendlyError(new Error(message))).toBe(message);
  });
  it("explains faucet internal failures and provides a fallback", () => {
    expect(friendlyError(new Error("airdrop to wallet failed: Internal error"))).toContain("faucet.solana.com");
    expect(friendlyError(new TypeError("Failed to fetch"))).toContain("Devnet is unavailable");
  });
});

describe("real transaction construction", () => {
  function fundedUsdc() {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    const empty = Keypair.generate().publicKey;
    AccountLayout.encode({ mint: USDC_DEVNET_MINT, owner: payer.publicKey, amount: 50_000_000n, delegateOption: 0, delegate: empty, state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: empty }, data);
    const source = getAssociatedTokenAddressSync(USDC_DEVNET_MINT, payer.publicKey);
    vi.spyOn(connection, "getAccountInfo").mockImplementation(async key => key.equals(source) ? { data, executable: false, lamports: 2_039_280, owner: TOKEN_PROGRAM_ID, rentEpoch: 0 } : null);
  }
  it("transfers official Devnet USDC with checked mint, amount and decimals", async () => {
    fundedUsdc();
    const tx = await buildTransfer({ action: "send", amount: 12.345678, token: "USDC", recipient: "mom", address: recipient.toBase58() }, payer.publicKey, Keypair.generate().publicKey);
    const transfer = decodeTransferCheckedInstruction(tx.instructions[1]);
    expect(transfer.keys.mint.pubkey.equals(USDC_DEVNET_MINT)).toBe(true);
    expect(transfer.keys.destination.pubkey.equals(getAssociatedTokenAddressSync(USDC_DEVNET_MINT, recipient))).toBe(true);
    expect(transfer.data.amount).toBe(12_345_678n);
    expect(transfer.data.decimals).toBe(6);
  });
  it("estimates token rent plus fees without signing or broadcasting", async () => {
    fundedUsdc();
    vi.spyOn(connection, "getLatestBlockhash").mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 900 });
    vi.spyOn(connection, "getFeeForMessage").mockResolvedValue({ context: { slot: 1 }, value: 5000 });
    vi.spyOn(connection, "getMinimumBalanceForRentExemption").mockResolvedValue(2_039_280);
    vi.spyOn(connection, "getBalance").mockResolvedValue(1_000_000_000);
    const broadcast = vi.spyOn(connection, "sendRawTransaction");
    const intent = { action: "send" as const, amount: 5, token: "USDC" as const, recipient: "mom", address: recipient.toBase58() };
    expect(await estimateTransfer(intent, payer.publicKey)).toMatchObject({ feeLamports: 5000, rentLamports: 2_039_280, totalSolLamports: 2_044_280, remainingSolLamports: 997_955_720 });
    expect(broadcast).not.toHaveBeenCalled();
    vi.mocked(connection.getBalance).mockResolvedValue(5000);
    await expect(estimateTransfer(intent, payer.publicKey)).rejects.toThrow("rent");
  });
  it("does not invent a zero balance on network failures", async () => {
    const account = vi.spyOn(connection, "getAccountInfo").mockResolvedValue(null);
    expect(await getSplBalance(payer.publicKey, USDC_DEVNET_MINT)).toBe(0n);
    account.mockRejectedValue(new Error("RPC unavailable"));
    await expect(getSplBalance(payer.publicKey, USDC_DEVNET_MINT)).rejects.toThrow("RPC unavailable");
  });
  it("builds an exact SOL transfer to the approved address", async () => {
    vi.spyOn(connection, "getBalance").mockResolvedValue(2_000_000_000);
    const tx = await buildTransfer({ action: "send", amount: .1, token: "SOL", recipient: "mom", address: recipient.toBase58() }, payer.publicKey);
    const transfer = SystemInstruction.decodeTransfer(tx.instructions[0]);
    expect(transfer.fromPubkey.equals(payer.publicKey)).toBe(true);
    expect(transfer.toPubkey.equals(recipient)).toBe(true);
    expect(transfer.lamports).toBe(100_000_000n);
  });
  it("creates a fixed supply of 1000 WHISPER atomically", async () => {
    vi.spyOn(connection, "getMinimumBalanceForRentExemption").mockResolvedValue(1_500_000);
    const tx = await buildWhisperMint(payer.publicKey, Keypair.generate().publicKey);
    expect(tx.instructions).toHaveLength(5);
    expect(tx.instructions[1].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(decodeMintToInstruction(tx.instructions[3]).data.amount).toBe(1_000_000_000n);
    const revoke = decodeSetAuthorityInstruction(tx.instructions[4]);
    expect(revoke.data.authorityType).toBe(AuthorityType.MintTokens);
    expect(revoke.data.newAuthority).toBeNull();
  });
  it("rejects sending the entire balance before signing", async () => {
    vi.spyOn(connection, "getBalance").mockResolvedValue(100_000_000);
    await expect(buildTransfer({ action: "send", amount: .1, token: "SOL", recipient: "mom", address: recipient.toBase58() }, payer.publicKey)).rejects.toThrow("fee");
  });
});

describe("broadcast and confirmation", () => {
  function setup() {
    vi.spyOn(connection, "getLatestBlockhash").mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 900 });
    vi.spyOn(connection, "getFeeForMessage").mockResolvedValue({ context: { slot: 1 }, value: 5000 });
    vi.spyOn(connection, "getBalance").mockResolvedValue(2_000_000_000);
    vi.spyOn(connection, "simulateTransaction").mockResolvedValue({ context: { slot: 1 }, value: { err: null, logs: [] } });
    vi.spyOn(connection, "confirmTransaction").mockResolvedValue({ context: { slot: 1 }, value: { err: null } });
    return new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: 1000 }));
  }
  it("saves a verifiable signature before broadcasting and confirms the exact blockhash", async () => {
    const tx = setup();
    const events: string[] = [];
    vi.spyOn(connection, "sendRawTransaction").mockImplementation(async raw => {
      expect(Transaction.from(raw).verifySignatures()).toBe(true);
      events.push("broadcast"); return "rpc-result";
    });
    const signature = await sendTransaction(tx, payer, () => events.push("persist"));
    expect(events).toEqual(["persist", "broadcast"]);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(expect.objectContaining({ signature, blockhash: tx.recentBlockhash, lastValidBlockHeight: 900 }), "confirmed");
  });
  it("preserves pending state when a broadcast response is lost", async () => {
    const tx = setup();
    vi.spyOn(connection, "sendRawTransaction").mockRejectedValue(new Error("network timeout"));
    const persist = vi.fn();
    await expect(sendTransaction(tx, payer, persist)).rejects.toBeInstanceOf(TransactionPendingError);
    expect(persist).toHaveBeenCalledOnce();
    expect(connection.confirmTransaction).not.toHaveBeenCalled();
  });
  it("never reports a failed on-chain transaction as success", async () => {
    const tx = setup();
    vi.spyOn(connection, "sendRawTransaction").mockResolvedValue("rpc-result");
    vi.spyOn(connection, "confirmTransaction").mockResolvedValue({ context: { slot: 1 }, value: { err: { InstructionError: [0, "InvalidArgument"] } } });
    await expect(sendTransaction(tx, payer, vi.fn())).rejects.toBeInstanceOf(TransactionFailedError);
  });
  it("does not broadcast if activity persistence fails", async () => {
    const tx = setup();
    const broadcast = vi.spyOn(connection, "sendRawTransaction");
    await expect(sendTransaction(tx, payer, () => { throw new Error("storage full"); })).rejects.toThrow("storage full");
    expect(broadcast).not.toHaveBeenCalled();
  });
  it("rechecks approval conditions after asynchronous simulation and before signing", async () => {
    const tx = setup();
    const broadcast = vi.spyOn(connection, "sendRawTransaction");
    const persist = vi.fn();
    await expect(sendTransaction(tx, payer, persist, [], () => { throw new Error("Contact changed"); })).rejects.toThrow("Contact changed");
    expect(broadcast).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
