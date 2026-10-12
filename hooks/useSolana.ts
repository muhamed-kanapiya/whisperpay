"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { buildTransfer, buildWhisperMint, connection, estimateTransfer, friendlyError, getSplBalance, requestDevnetAirdrop, sendTransaction, TransactionFailedError, USDC_DEVNET_MINT, WHISPER_DECIMALS } from "@/lib/solana";
import { readContacts, readHistory, readMint, readWallet, resetStorage, save, STORAGE } from "@/lib/storage";
import { resolveIntent, validAddress } from "@/lib/parseIntent";
import type { Activity, Contact, MintRecord, ResolvedIntent } from "@/lib/types";

export function useSolana() {
  const keypairRef = useRef<Keypair | null>(null);
  const historyRef = useRef<Activity[]>([]);
  const locked = useRef(false);
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [mint, setMint] = useState<MintRecord | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const updateHistory = useCallback((updater: (items: Activity[]) => Activity[]) => {
    const next = updater(historyRef.current).slice(0, 50);
    save(STORAGE.history, next);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const refresh = useCallback(async () => {
    const wallet = keypairRef.current;
    if (!wallet) return;
    const currentAddress = wallet.publicKey.toBase58();
    const sol = await connection.getBalance(wallet.publicKey, "confirmed");
    if (keypairRef.current !== wallet) return;
    setBalance(sol / LAMPORTS_PER_SOL);
    // A missing ATA is a zero balance; network failures remain unknown.
    try {
      const amount = await getSplBalance(wallet.publicKey, USDC_DEVNET_MINT);
      if (keypairRef.current === wallet) setUsdcBalance(Number(amount) / 1_000_000);
    } catch {
      if (keypairRef.current === wallet) setUsdcBalance(null);
    }
    if (keypairRef.current !== wallet) return;
    const savedMint = readMint(currentAddress);
    setMint(savedMint);
    if (savedMint) {
      const mintAddress = new PublicKey(savedMint.address);
      const info = await connection.getAccountInfo(mintAddress);
      if (info) {
        await getMint(connection, mintAddress);
        const account = await getAccount(connection, getAssociatedTokenAddressSync(mintAddress, wallet.publicKey));
        if (keypairRef.current === wallet) setTokenBalance(Number(account.amount) / 10 ** WHISPER_DECIMALS);
      } else { setTokenBalance(null); }
    }
    const pending = historyRef.current.filter(item => item.status === "pending");
    if (pending.length) {
      const blockHeight = await connection.getBlockHeight("finalized");
      const statuses = await connection.getSignatureStatuses(pending.map(item => item.signature), { searchTransactionHistory: true });
      if (keypairRef.current !== wallet) return;
      updateHistory(items => items.map(item => {
        const index = pending.findIndex(p => p.signature === item.signature);
        if (index < 0) return item;
        const status = statuses.value[index];
        if (status?.err) return { ...item, status: "failed" };
        if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return { ...item, status: "confirmed" };
        if (!status && item.lastValidBlockHeight && blockHeight > item.lastValidBlockHeight) return { ...item, status: "failed" };
        return item;
      }));
    }
  }, [updateHistory]);

  useEffect(() => {
    try {
      const wallet = readWallet();
      keypairRef.current = wallet;
      setPublicKey(wallet?.publicKey.toBase58() ?? null);
      setContacts(readContacts());
      historyRef.current = readHistory();
      setHistory(historyRef.current);
      if (wallet) {
        setMint(readMint(wallet.publicKey.toBase58()));
        void refresh().catch(e => setError(friendlyError(e)));
      }
    } catch (e) { setError(friendlyError(e)); }
    setReady(true);
    // Invalidate this tab immediately if another tab resets/replaces the wallet.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE.key || event.key === null) window.location.reload();
      if (event.key === STORAGE.contacts) setContacts(readContacts());
      if (event.key === STORAGE.history) { historyRef.current = readHistory(); setHistory(historyRef.current); }
    };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !locked.current) void refresh().catch(() => {});
    }, 30_000);
    return () => { window.removeEventListener("storage", onStorage); window.clearInterval(timer); };
  }, [refresh]);

  const run = useCallback(async <T,>(label: string, operation: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(label); setError(null); setNotice(null);
    const execute = async () => {
      // Reconcile storage before a mutation, including operations from other tabs.
      if (keypairRef.current && readWallet()?.publicKey.toBase58() !== keypairRef.current.publicKey.toBase58()) throw new Error("This wallet changed in another tab. Reload the page.");
      historyRef.current = readHistory();
      return operation();
    };
    try {
      if (navigator.locks) {
        return await navigator.locks.request("whisperpay-wallet", { ifAvailable: true }, lock => {
          if (!lock) throw new Error("A wallet operation is running in another tab. Wait for it to finish.");
          return execute();
        });
      }
      return await execute();
    } catch (e) {
      if (e instanceof TransactionFailedError) updateHistory(items => items.map(item => item.signature === e.signature ? { ...item, status: "failed" } : item));
      setError(friendlyError(e));
    } finally { locked.current = false; setBusy(null); }
  }, [updateHistory]);

  const record = useCallback((item: Omit<Activity, "createdAt" | "status">) => {
    updateHistory(items => [{ ...item, createdAt: Date.now(), status: "pending" }, ...items.filter(i => i.signature !== item.signature)]);
  }, [updateHistory]);
  const confirmed = useCallback((signature: string) => {
    updateHistory(items => items.map(item => item.signature === signature ? { ...item, status: "confirmed" } : item));
  }, [updateHistory]);

  const mintTokens = useCallback(async (wallet: Keypair) => {
    const existing = readMint(wallet.publicKey.toBase58());
    if (existing) {
      const info = await connection.getAccountInfo(new PublicKey(existing.address));
      if (info) { await refresh(); return; }
      if (historyRef.current.some(item => item.kind === "mint" && item.status === "pending")) throw new Error("Token creation is still pending. Refresh activity before trying again.");
    }
    setBusy("Creating WHISPER tokens…");
    const mintKey = Keypair.generate();
    const tx = await buildWhisperMint(wallet.publicKey, mintKey.publicKey);
    const signature = await sendTransaction(tx, wallet, (sig, lastValidBlockHeight) => {
      const value = { address: mintKey.publicKey.toBase58(), wallet: wallet.publicKey.toBase58() };
      save(STORAGE.mint, value); setMint(value);
      record({ signature: sig, kind: "mint", amount: 1000, token: "WHISPER", lastValidBlockHeight });
    }, [mintKey]);
    confirmed(signature);
    await refresh();
    setNotice("1,000 real WHISPER demo tokens are ready. They have no monetary value.");
  }, [confirmed, record, refresh]);

  const airdrop = useCallback(async (wallet: Keypair) => {
    if (historyRef.current.some(item => item.kind === "airdrop" && item.status === "pending")) throw new Error("An airdrop is already pending. Refresh activity to check it.");
    setBusy("Requesting 2 Devnet SOL…");
    const signature = await requestDevnetAirdrop(wallet.publicKey, sig => record({ signature: sig, kind: "airdrop", amount: 2, token: "SOL" }));
    confirmed(signature);
    await refresh();
    setNotice("Your Devnet airdrop is confirmed.");
    await mintTokens(wallet);
  }, [confirmed, mintTokens, record, refresh]);

  const createDemoWallet = useCallback(() => run("Creating your wallet…", async () => {
    if (readWallet()) throw new Error("A demo wallet already exists. Reload to open it.");
    const wallet = Keypair.generate();
    save(STORAGE.key, Array.from(wallet.secretKey));
    keypairRef.current = wallet;
    setPublicKey(wallet.publicKey.toBase58());
    setBalance(0);
    // Fresh valid demo recipients. Their private keys are discarded, so these
    // are clearly labeled test destinations; users can replace them in Contacts.
    const defaults = ["mom", "alice"].map(name => ({ name, address: Keypair.generate().publicKey.toBase58() }));
    save(STORAGE.contacts, defaults); setContacts(defaults);
    await airdrop(wallet);
  }), [airdrop, run]);

  const send = useCallback((intent: ResolvedIntent) => run("Sending on Devnet…", async () => {
    const wallet = keypairRef.current;
    if (!wallet) throw new Error("Create a demo wallet first.");
    if (historyRef.current.some(item => item.kind === "send" && item.status === "pending")) throw new Error("A transfer is still pending. Refresh activity or check Solscan before sending again.");
    const savedMint = readMint(wallet.publicKey.toBase58());
    const tx = await buildTransfer(intent, wallet.publicKey, savedMint ? new PublicKey(savedMint.address) : undefined);
    const signature = await sendTransaction(tx, wallet, (sig, lastValidBlockHeight) => record({ signature: sig, kind: "send", token: intent.token, amount: intent.amount, recipient: intent.recipient, address: intent.address, lastValidBlockHeight }), [], () => {
      if (readWallet()?.publicKey.toBase58() !== wallet.publicKey.toBase58()) throw new Error("The wallet changed. Reload before sending.");
      if (resolveIntent(intent, readContacts()).address !== intent.address) throw new Error("This contact’s address changed. Cancel and review a new payment.");
    });
    confirmed(signature);
    try { await refresh(); } catch { setNotice("Transfer confirmed. Balance refresh is temporarily unavailable."); }
    return signature;
  }), [confirmed, record, refresh, run]);

  const addContact = (name: string, address: string) => {
    const cleanName = name.trim().replace(/\s+/g, " ").toLowerCase();
    if (!/^[a-z][a-z0-9 -]{0,29}$/.test(cleanName) || ["confirm", "yes", "send", "cancel", "no", "stop"].includes(cleanName)) throw new Error("Use a contact name with 1–30 letters, numbers, spaces, or hyphens, not a voice command.");
    if (!validAddress(address.trim()) || !PublicKey.isOnCurve(new PublicKey(address.trim()).toBytes())) throw new Error("Enter a valid Solana wallet address.");
    const next = [...readContacts().filter(c => c.name !== cleanName), { name: cleanName, address: address.trim() }];
    save(STORAGE.contacts, next); setContacts(next);
  };
  const removeContact = (name: string) => {
    const next = readContacts().filter(c => c.name !== name);
    save(STORAGE.contacts, next); setContacts(next);
  };
  const resetWallet = () => run("Resetting wallet…", async () => {
    resetStorage(); keypairRef.current = null; historyRef.current = [];
    setPublicKey(null); setBalance(null); setTokenBalance(null); setUsdcBalance(null); setMint(null); setContacts([]); setHistory([]);
  });

  const quote = useCallback(async (intent: ResolvedIntent) => {
    const wallet = keypairRef.current;
    if (!wallet) throw new Error("Create a demo wallet first.");
    const savedMint = readMint(wallet.publicKey.toBase58());
    return estimateTransfer(intent, wallet.publicKey, savedMint ? new PublicKey(savedMint.address) : undefined);
  }, []);

  return { ready, publicKey, balance, tokenBalance, usdcBalance, mint, contacts, history, busy, error, notice, createDemoWallet, send, quote, addContact, removeContact, resetWallet,
    clearError: () => setError(null),
    refresh: () => run("Refreshing…", refresh),
    requestAirdrop: () => run("Requesting airdrop…", async () => { if (keypairRef.current) await airdrop(keypairRef.current); }),
    createWhisperToken: () => run("Creating WHISPER…", async () => { if (keypairRef.current) await mintTokens(keypairRef.current); }),
  };
}
