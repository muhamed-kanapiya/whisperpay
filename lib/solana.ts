import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, type Signer } from "@solana/web3.js";
import { ACCOUNT_SIZE, ASSOCIATED_TOKEN_PROGRAM_ID, AuthorityType, MINT_SIZE, TOKEN_PROGRAM_ID, TokenAccountNotFoundError, createAssociatedTokenAccountIdempotentInstruction, createInitializeMintInstruction, createMintToInstruction, createSetAuthorityInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { toBaseUnits } from "./parseIntent";
import type { ResolvedIntent, Token, TransferQuote } from "./types";

// SPL instruction constructors require Buffer in browsers.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const connection = new Connection(DEVNET_RPC, {
  commitment: "confirmed",
  disableRetryOnRateLimit: true,
  confirmTransactionInitialTimeout: 45_000,
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
});
export const WHISPER_DECIMALS = 6;
// Circle's official Solana Devnet mint. Test tokens have no dollar value.
// https://developers.circle.com/stablecoins/usdc-contract-addresses
export const USDC_DEVNET_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export function transferMint(token: Token, whisperMint?: PublicKey): PublicKey {
  if (token === "USDC") return USDC_DEVNET_MINT;
  if (token === "WHISPER" && whisperMint) return whisperMint;
  throw new Error("Create your WHISPER demo tokens first.");
}
export async function getSplBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
  try { return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner))).amount; }
  catch (error) { if (error instanceof TokenAccountNotFoundError) return 0n; throw error; }
}
export type Submitted = (signature: string, lastValidBlockHeight?: number) => void;

export class TransactionPendingError extends Error {
  constructor(public signature: string) { super("Submitted, but confirmation is still pending. Check activity or Solscan before trying again."); }
}
export class TransactionFailedError extends Error {
  constructor(public signature: string) { super("The transaction failed on Devnet. No transfer was completed; a network fee may have been charged."); }
}

export async function confirmSignature(signature: string, block?: { blockhash: string; lastValidBlockHeight: number }) {
  try {
    if (block) {
      const result = await connection.confirmTransaction({ signature, ...block, abortSignal: AbortSignal.timeout(45_000) }, "confirmed");
      if (result.value.err) throw new TransactionFailedError(signature);
      return;
    }
    // Airdrop RPC doesn't return its blockhash, so poll the exact signature.
    for (let attempt = 0; attempt < 20; attempt++) {
      const { value: [status] } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      if (status?.err) throw new TransactionFailedError(signature);
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (error) {
    if (error instanceof TransactionFailedError) throw error;
    throw new TransactionPendingError(signature);
  }
  throw new TransactionPendingError(signature);
}

export async function requestDevnetAirdrop(publicKey: PublicKey, onSubmitted: Submitted) {
  const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
  onSubmitted(signature);
  await confirmSignature(signature);
  return signature;
}

export async function sendTransaction(transaction: Transaction, payer: Keypair, onSubmitted: Submitted, additionalSigners: Signer[] = [], beforeSign?: () => void) {
  const block = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = block.blockhash;
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
  if (fee.value === null) throw new Error("Could not estimate the network fee. Please retry.");
  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  if (balance < fee.value) throw new Error("Not enough Devnet SOL for the network fee. Request an airdrop first.");
  const simulation = await connection.simulateTransaction(transaction, [payer, ...additionalSigners]);
  if (simulation.value.err) throw new Error("Devnet simulation failed. Check your balance, recipient, and SOL available for fees or token account rent.");
  // simulateTransaction may update the transaction's blockhash. Restore the exact
  // blockhash used by the block-height confirmation strategy before signing.
  transaction.recentBlockhash = block.blockhash;
  beforeSign?.();
  transaction.sign(payer, ...additionalSigners);
  if (!transaction.signature) throw new Error("Could not sign this transaction.");
  const signature = bs58.encode(transaction.signature);
  // Persist before broadcasting: an RPC timeout does not prove a payment failed.
  onSubmitted(signature, block.lastValidBlockHeight);
  try {
    await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" });
  } catch {
    throw new TransactionPendingError(signature);
  }
  await confirmSignature(signature, block);
  return signature;
}

export async function buildTransfer(intent: ResolvedIntent, payer: PublicKey, mint?: PublicKey) {
  const recipient = new PublicKey(intent.address);
  if (recipient.equals(payer)) throw new Error("Choose a recipient other than this demo wallet.");
  if (!PublicKey.isOnCurve(recipient.toBytes())) throw new Error("Use a regular wallet address for this demo, not a program address.");
  const transaction = new Transaction();
  if (intent.token === "SOL") {
    const lamports = Number(toBaseUnits(intent.amount, 9));
    const balance = await connection.getBalance(payer);
    if (balance <= lamports) throw new Error("Not enough SOL. Leave some Devnet SOL for the network fee.");
    return transaction.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports }));
  }
  mint = transferMint(intent.token, mint);
  const source = getAssociatedTokenAddressSync(mint, payer);
  const target = getAssociatedTokenAddressSync(mint, recipient);
  const amount = toBaseUnits(intent.amount, WHISPER_DECIMALS);
  const available = await getSplBalance(payer, mint);
  if (available < amount) throw new Error(`Not enough ${intent.token} tokens for this transfer.${intent.token === "USDC" ? " Get test USDC from the Circle faucet, then refresh." : ""}`);
  return transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(payer, target, recipient, mint),
    createTransferCheckedInstruction(source, mint, target, payer, amount, WHISPER_DECIMALS),
  );
}

/** Read-only estimate; no signing or broadcast. */
export async function estimateTransfer(intent: ResolvedIntent, payer: PublicKey, whisperMint?: PublicKey): Promise<TransferQuote> {
  const transaction = await buildTransfer(intent, payer, whisperMint);
  transaction.feePayer = payer;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  const [fee, balance] = await Promise.all([
    connection.getFeeForMessage(transaction.compileMessage(), "confirmed"),
    connection.getBalance(payer, "confirmed"),
  ]);
  if (fee.value === null) throw new Error("The network couldn't estimate this fee. Refresh the estimate.");
  let rent = 0;
  if (intent.token !== "SOL") {
    const target = getAssociatedTokenAddressSync(transferMint(intent.token, whisperMint), new PublicKey(intent.address));
    if (!(await connection.getAccountInfo(target, "confirmed"))) rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
  }
  const total = fee.value + rent + (intent.token === "SOL" ? Number(toBaseUnits(intent.amount, 9)) : 0);
  if (balance < total) throw new Error("Add Devnet SOL to cover this payment, network fee, and any token account rent.");
  return { feeLamports: fee.value, rentLamports: rent, totalSolLamports: total, remainingSolLamports: balance - total, checkedAt: Date.now() };
}

export async function buildWhisperMint(payer: PublicKey, mint: PublicKey) {
  const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const ata = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  // Atomic initialization + fixed supply. No separate partial minting steps.
  return new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(mint, WHISPER_DECIMALS, payer, null),
    createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mint),
    createMintToInstruction(mint, ata, payer, 1000n * 10n ** BigInt(WHISPER_DECIMALS)),
    createSetAuthorityInstruction(mint, payer, AuthorityType.MintTokens, null),
  );
}

export function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (/429|too many requests|rate limit/i.test(message)) return "The public Devnet faucet or RPC is rate-limited. Your wallet is ready. Try later, or fund this address at faucet.solana.com.";
  if (/airdrop.*failed|airdrop.*internal error/i.test(message)) return "The public Devnet faucet couldn't fund this wallet right now. Try later, or copy your address and use faucet.solana.com, then refresh.";
  if (/failed to fetch|fetch failed|networkerror|network request|network connection|403|timed out|timeout/i.test(message)) return "Devnet is unavailable or the request timed out. Refresh your balance and activity before retrying.";
  return message;
}
