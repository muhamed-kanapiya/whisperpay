"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, friendlyError, sendTransaction, TransactionFailedError } from "@/lib/solana";
import { readWallet } from "@/lib/storage";
import { readInstrument, saveInstrument, validateInstrument } from "@/lib/corporate/storage";
import { ACTION_LABELS, calculateEntitlements, formatCash, type CorporateAction, type Instrument, type Snapshot } from "@/lib/corporate/model";
import { SETUP_STEPS, buildSettlement, buildSetup, buildSnapshot, captureSnapshot, newInstrument, readRegistry, reconcileReceipts } from "@/lib/corporate/solana";

export type CorporateReview = { operation: string; title: string; explanation: string; instrumentId: string; snapshot?: Snapshot; createdAt: number };
export function useCorporate() {
  const [issuer, setIssuer] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [registry, setRegistry] = useState<Awaited<ReturnType<typeof readRegistry>> | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<CorporateReview | null>(null);
  const locked = useRef(false);
  const walletAtMount = useRef<string | null>(null);
  const latest = useRef(instrument); latest.current = instrument;
  const persist = (value: Instrument) => { saveInstrument(value); latest.current = value; setInstrument(value); };

  const run = async <T,>(label: string, operation: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return;
    locked.current = true; setBusy(label); setError(null); setNotice(null);
    const work = async () => {
      const wallet = readWallet();
      if (!wallet || wallet.publicKey.toBase58() !== walletAtMount.current) throw new Error("The issuer wallet changed. Reload this page.");
      // Read storage again inside the shared wallet lock, preventing cross-tab stale approvals.
      latest.current = readInstrument(wallet.publicKey.toBase58());
      if (latest.current) setInstrument(latest.current);
      return operation();
    };
    try {
      if (navigator.locks) return await navigator.locks.request("whisperpay-wallet", { ifAvailable: true }, lock => {
        if (!lock) throw new Error("Another tab is using this demo wallet. Finish that action first.");
        return work();
      });
      throw new Error("This browser cannot lock the issuer wallet across tabs. Use current Chrome or Edge over HTTPS.");
    } catch (e) { setError(friendlyError(e)); }
    finally { locked.current = false; setBusy(null); }
  };

  const refresh = async () => run("Checking Solana receipts…", async () => {
    const wallet = readWallet()!;
    setBalance(await connection.getBalance(wallet.publicKey, "confirmed") / LAMPORTS_PER_SOL);
    if (latest.current) {
      const updated = await reconcileReceipts(latest.current); persist(updated);
      if (updated.receipts.seal?.status === "confirmed") setRegistry(await readRegistry(updated));
    }
  });

  useEffect(() => {
    try {
      const wallet = readWallet();
      if (!wallet) return;
      const address = wallet.publicKey.toBase58(); walletAtMount.current = address; setIssuer(address);
      const saved = readInstrument(address); latest.current = saved; setInstrument(saved);
      connection.getBalance(wallet.publicKey, "confirmed").then(lamports => setBalance(lamports / LAMPORTS_PER_SOL)).catch(e => setError(friendlyError(e)));
    } catch (e) { setError(friendlyError(e)); }
    const onStorage = () => { setReview(null); setRegistry(null); setError("Browser wallet data changed in another tab. Reload to review the latest state."); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const create = async () => run("Preparing instrument terms…", async () => {
    if (latest.current) throw new Error("This browser already has a demo instrument. Export its audit before starting another issuer wallet.");
    const draft = await newInstrument(readWallet()!.publicKey); persist(draft);
    setNotice("Instrument terms prepared. Review each setup transaction to issue real Devnet tokens.");
  });
  const prepareSetup = async () => run("Preparing setup review…", async () => {
    const current = latest.current;
    if (!current) throw new Error("Prepare an instrument first.");
    if (Object.values(current.receipts).some(r => r.status === "pending")) throw new Error("Refresh and reconcile the pending transaction first.");
    const operation = SETUP_STEPS.find(step => current.receipts[step]?.status !== "confirmed");
    if (!operation) return;
    const explanation: Record<string, string> = {
      bond: "Create a non-transferable Token-2022 bond mint. This issuer receives permanent burn authority for redemption.",
      cash: "Create 100,000 testUSD settlement tokens in the issuer treasury and permanently revoke their mint authority. These tokens have no dollar value.",
      "holder-0": "Issue 10 bonds to Investor A and create their testUSD settlement account.",
      "holder-1": "Issue 20 bonds to Investor B and create their testUSD settlement account.",
      "holder-2": "Issue 30 bonds to Investor C and create their testUSD settlement account.",
      seal: "Verify all 60 bonds are held in the registry, then permanently revoke further bond issuance.",
    };
    setReview({ operation, title: operation === "seal" ? "Seal the holder registry" : `Set up ${operation.replace("-", " ")}`, explanation: explanation[operation], instrumentId: current.id, createdAt: Date.now() });
  });
  const prepareAction = async (action: CorporateAction) => run("Checking holders and entitlements…", async () => {
    const current = latest.current;
    if (!current) throw new Error("Create and issue the demo instrument first.");
    if (current.receipts[action]?.status === "confirmed") throw new Error("This corporate action has already settled.");
    if (current.receipts[`snapshot-${action}`]?.status === "confirmed") {
      await buildSettlement(current, action); // Read-only preflight before showing an executable review.
      const snapshot = current.snapshots[action]!;
      const total = calculateEntitlements(action, snapshot.holders).reduce((sum, row) => sum + row.total, 0n);
      setReview({ operation: action, title: ACTION_LABELS[action], explanation: `Pay ${formatCash(total)} testUSD across three holders${action === "coupon" ? "." : " and burn the redeemed bonds atomically."}`, snapshot, instrumentId: current.id, createdAt: Date.now() });
    } else {
      const snapshot = await captureSnapshot(current, action);
      setReview({ operation: `snapshot-${action}`, title: `Record date · ${ACTION_LABELS[action]}`, explanation: "Commit these finalized holder balances to Solana. This fixes the eligibility input; a separate review is required to settle.", snapshot, instrumentId: current.id, createdAt: Date.now() });
    }
  });
  const confirm = async () => {
    const approved = review;
    if (!approved) return;
    await run("Simulating and confirming on Devnet…", async () => {
      const saved = latest.current;
      if (!saved || saved.id !== approved.instrumentId) throw new Error("The instrument changed. Prepare a new review.");
      let current: Instrument = saved;
      if (Date.now() - approved.createdAt > 120_000) { setReview(null); throw new Error("This review expired. Prepare the action again."); }
      if (Object.values(current.receipts).some(r => r.status === "pending")) throw new Error("A transaction is still pending. Refresh first.");
      let tx: Transaction;
      if (approved.operation.startsWith("snapshot-")) {
        if (!approved.snapshot) throw new Error("Missing snapshot.");
        current = { ...current, snapshots: { ...current.snapshots, [approved.snapshot.action]: approved.snapshot } };
        tx = await buildSnapshot(current, approved.snapshot);
      } else if (SETUP_STEPS.includes(approved.operation as typeof SETUP_STEPS[number])) tx = await buildSetup(current, approved.operation as typeof SETUP_STEPS[number]);
      else tx = await buildSettlement(current, approved.operation as CorporateAction);
      const wallet = readWallet()!;
      const beforeSign = () => {
        if (readWallet()?.publicKey.toBase58() !== current.issuer || readInstrument(current.issuer)?.id !== current.id || Date.now() - approved.createdAt > 120_000) throw new Error("Wallet or review changed. Prepare again.");
      };
      let submitted = false;
      try {
        await sendTransaction(tx, wallet, (signature, lastValidBlockHeight) => {
          if (!lastValidBlockHeight) throw new Error("Missing transaction expiry.");
          current = { ...current!, receipts: { ...current!.receipts, [approved.operation]: { signature, lastValidBlockHeight, status: "pending" } } };
          persist(current); submitted = true; setReview(null);
        }, [], beforeSign);
        current = { ...current, receipts: { ...current.receipts, [approved.operation]: { ...current.receipts[approved.operation], status: "confirmed" } } };
        persist(current); setNotice("Confirmed on Solana Devnet. Allow finality before preparing the next corporate action, then refresh.");
        setRegistry(null);
      } catch (e) {
        if (e instanceof TransactionFailedError && submitted) {
          current = { ...current, receipts: { ...current.receipts, [approved.operation]: { ...current.receipts[approved.operation], status: "failed" } } }; persist(current);
        }
        throw e;
      }
    });
  };
  const restore = async (raw: string) => run("Restoring public audit…", async () => {
    const saved = validateInstrument(JSON.parse(raw), issuer!);
    if (latest.current && latest.current.id !== saved.id) throw new Error("This browser already tracks a different instrument.");
    // Imported status labels are not trusted as chain evidence: reconcile every signature.
    const receipts = Object.fromEntries(Object.entries(saved.receipts).map(([op, receipt]) => [op, { ...receipt, status: "pending" as const }]));
    persist(await reconcileReceipts({ ...saved, receipts })); setReview(null); setRegistry(null);
    setNotice("Public audit restored. Snapshot contents and mint authorities are checked against Solana before settlement.");
  });
  const cancel = useCallback(() => setReview(null), []);
  return { issuer, instrument, registry, balance, busy, error, notice, review, create, refresh, prepareSetup, prepareAction, confirm, cancel, restore };
}
