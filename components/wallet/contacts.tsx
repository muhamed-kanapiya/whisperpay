"use client";
import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import type { Contact } from "@/lib/types";
import { truncate } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

export function Contacts({ contacts, disabled, onSave, onRemove }: { contacts: Contact[]; disabled: boolean; onSave: (name: string, address: string) => void; onRemove: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try { onSave(name, address); setName(""); setAddress(""); setError(null); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save contact."); }
  };
  return <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-medium"><Users size={15} className="text-muted" />Contacts<span className="ml-1 text-xs text-muted">{contacts.length}</span></h2><Button variant="ghost" size="sm" disabled={disabled} aria-expanded={open} aria-controls="contact-form" onClick={() => { setOpen(!open); setName(""); setAddress(""); setError(null); }}>{open ? <X size={14} /> : <Plus size={14} />}{open ? "Close" : "Add contact"}</Button></div>
    <p className="mb-3 mt-1 text-[11px] leading-5 text-muted">Mom and Alice start as test destinations. Edit them to use your own addresses.</p>
    <div className="divide-y divide-white/5">{contacts.map(contact => <div key={contact.name} className="flex items-center gap-3 py-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple/10 text-xs uppercase text-[#bf9eea]">{contact.name[0]}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium capitalize">{contact.name}</p><details className="mt-1 text-[10px] text-muted"><summary className="flex cursor-pointer list-none items-center gap-1 font-mono">{truncate(contact.address)}<ChevronDown size={10} /></summary><p className="mt-1 break-all font-mono leading-5">{contact.address}</p></details></div><Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${contact.name}`} disabled={disabled} onClick={() => { setName(contact.name); setAddress(contact.address); setError(null); setOpen(true); }}><Pencil size={12} /></Button><Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${contact.name}`} disabled={disabled} onClick={() => { try { onRemove(contact.name); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't remove contact."); } }}><Trash2 size={12} /></Button></div>)}</div>
    {!contacts.length && <p className="py-5 text-center text-xs text-muted">Create a wallet, then add someone to whisper to.</p>}
    {open && <form id="contact-form" onSubmit={submit} className="mt-4 space-y-3 border-t border-white/10 pt-4"><div><label htmlFor="contact-name" className="mb-1.5 block text-[11px] text-muted">Name</label><Input id="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. alex" required maxLength={30} autoComplete="off" disabled={disabled} /></div><div><label htmlFor="contact-address" className="mb-1.5 block text-[11px] text-muted">Full Solana address</label><Input id="contact-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Paste their wallet address" required autoComplete="off" spellCheck={false} disabled={disabled} /></div><p className="text-[10px] leading-5 text-muted">Saving an existing name replaces its address. Always verify the address before confirming a payment.</p><Button size="sm" type="submit" disabled={disabled}><Check size={13} />Save contact</Button></form>}
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
  </Card>;
}
