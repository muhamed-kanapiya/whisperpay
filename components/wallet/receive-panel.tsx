"use client";
import { useEffect, useState } from "react";
import { ArrowDownLeft, Check, Copy, Link2 } from "lucide-react";
import { paymentRequestUrl } from "@/lib/payment-request";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

export function ReceivePanel({ address }: { address: string | null }) {
  const [amount, setAmount] = useState("5");
  const [token, setToken] = useState("USDC");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(false);
  useEffect(() => { setLink(""); setCopied(false); setError(null); }, [address, amount, token]);
  const create = () => {
    if (!address) return;
    try {
      setLink(paymentRequestUrl(window.location.origin, amount, token, address));
      setLocal(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't create request."); }
  };
  return <Card id="receive-panel" className="scroll-mt-24 p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-sm font-medium"><ArrowDownLeft size={15} className="text-mint" />Receive & request</h2>
    <p className="mb-5 mt-2 text-xs leading-5 text-muted">Share a payment request. Your recipient reviews it in their own WhisperPay wallet.</p>
    <form onSubmit={e => { e.preventDefault(); create(); }}>
      <div className="grid grid-cols-[1fr_110px] gap-3"><div><label className="field-label" htmlFor="request-amount">Request amount</label><Input id="request-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={!address} required maxLength={24} /></div><div><label className="field-label" htmlFor="request-token">Asset</label><select id="request-token" className="wallet-select" value={token} onChange={e => setToken(e.target.value)} disabled={!address}><option>USDC</option><option>SOL</option></select></div></div>
      <Button className="mt-4 w-full" variant="outline" disabled={!address} type="submit"><Link2 size={14} />Create payment link</Button>
    </form>
    {link && <div className="mt-4 rounded-xl border border-mint/15 bg-mint/[.025] p-3">
      <label htmlFor="payment-link" className="field-label">Your request link</label><Input id="payment-link" className="text-xs" value={link} readOnly onFocus={e => e.target.select()} />
      <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setError(null); } catch { setError("Select the link above and copy it manually."); } }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Link copied" : "Copy payment link"}</Button>
      <p role="status" className="mt-2 text-[10px] leading-5 text-muted">{local ? "Local preview: this link works on this computer. Deploy the app to share links with others." : "Anyone with this link can see the requested amount and public wallet address."}</p>
      <p className="mt-1 text-[10px] leading-5 text-muted">Opening the link never sends funds. Requests are editable links, not signed invoices or proof of payment.</p>
    </div>}
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    {!address && <p className="mt-3 text-center text-[11px] text-muted">Create a demo wallet to receive payments.</p>}
  </Card>;
}
