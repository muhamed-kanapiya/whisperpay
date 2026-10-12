"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Contact, Token } from "@/lib/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PaymentForm({ contacts, disabled, onReview }: { contacts: Contact[]; disabled: boolean; onReview: (command: string) => void }) {
  const [token, setToken] = useState<Token>("SOL");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  return <form className="space-y-4 py-7" onSubmit={event => { event.preventDefault(); onReview(`send ${amount} ${token} to ${recipient}`); }}>
    <div className="grid grid-cols-[1fr_110px] gap-3">
      <div><label htmlFor="send-amount" className="field-label">Amount</label><Input id="send-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" maxLength={24} required disabled={disabled} autoComplete="off" /></div>
      <div><label htmlFor="send-token" className="field-label">Asset</label><select id="send-token" className="wallet-select" value={token} onChange={e => setToken(e.target.value as Token)} disabled={disabled}><option>SOL</option><option>USDC</option><option>WHISPER</option></select></div>
    </div>
    <div><label htmlFor="send-recipient" className="field-label">Contact or full wallet address</label><Input id="send-recipient" list="send-contacts" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="mom, alice, or a Solana address" maxLength={64} autoComplete="off" spellCheck={false} required disabled={disabled} /><datalist id="send-contacts">{contacts.map(contact => <option key={contact.name} value={contact.name} />)}</datalist></div>
    <Button type="submit" className="w-full" disabled={disabled || !amount.trim() || !recipient.trim()}>Review payment<ArrowRight size={15} /></Button>
    <p className="text-center text-[11px] leading-5 text-muted">SOL, test USDC, and WHISPER. Devnet only.</p>
  </form>;
}
