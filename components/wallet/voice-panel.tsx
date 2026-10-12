"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CircleCheck, Keyboard, Loader2, Mic, Pencil, RefreshCw, ShieldCheck, Square, Volume2, X } from "lucide-react";
import { useVoice } from "@/hooks/useVoice";
import { useReadback } from "@/hooks/useReadback";
import { commandForIntent, isCancellation, isConfirmation, parseIntent, readOnlyCommand, resolveIntent, reviseAmount } from "@/lib/parseIntent";
import { readPaymentRequest, type PaymentRequest } from "@/lib/payment-request";
import { friendlyError } from "@/lib/solana";
import type { Contact, ResolvedIntent, Token, TransferQuote } from "@/lib/types";
import { explorerUrl, truncate } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { PaymentForm } from "./payment-form";

type Props = {
  address: string | null; contacts: Contact[]; busy: boolean;
  balances: Record<Token, number | null>;
  onSend: (intent: ResolvedIntent) => Promise<string | undefined>;
  onQuote: (intent: ResolvedIntent) => Promise<TransferQuote>;
};
const sol = (lamports: number) => (lamports / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 9 });

export function VoicePanel({ address, contacts, busy, balances, onSend, onQuote }: Props) {
  const [mode, setMode] = useState<"voice" | "form">("voice");
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState<ResolvedIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ signature: string; amount: number; token: string; recipient: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [quote, setQuote] = useState<{ intent: ResolvedIntent; data?: TransferQuote; error?: string } | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const inFlight = useRef(false);
  const stopRef = useRef<() => void>(() => {});
  const speechRef = useRef<{ active: () => boolean; stop: () => void }>({ active: () => false, stop: () => {} });
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const readback = useReadback();
  speechRef.current = { active: readback.isSpeaking, stop: readback.stop };
  const currentQuote = quote?.intent === preview ? quote : null;

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const incoming = readPaymentRequest(params);
      if (incoming) { setRequest(incoming); setCommand(commandForIntent(incoming)); }
      else setCommand((params.get("command") ?? "").slice(0, 180));
    } catch (e) { setRequestError(e instanceof Error ? e.message : "Invalid payment request."); }
  }, []);
  useEffect(() => {
    setPreview(null); setSuccess(null); setError(null); setResponse(null);
    stopRef.current(); speechRef.current.stop();
  }, [address]);
  useEffect(() => {
    if (!preview) return;
    reviewRef.current?.focus();
    speechRef.current.stop();
  }, [preview]);
  useEffect(() => {
    if (!preview) return;
    let active = true;
    setQuote(null);
    void onQuote(preview).then(
      data => { if (active) setQuote({ intent: preview, data }); },
      reason => { if (active) setQuote({ intent: preview, error: friendlyError(reason) }); },
    );
    return () => { active = false; };
  }, [preview, onQuote, quoteRevision]);

  const confirm = useCallback(async () => {
    if (!preview || busy || inFlight.current || speechRef.current.active()) return;
    if (!currentQuote?.data) { setError("Wait for a successful balance and fee check before confirming."); return; }
    if (Date.now() - currentQuote.data.checkedAt > 60_000) {
      setQuote(null); setQuoteRevision(value => value + 1);
      setError("Refreshing the estimate. Review the updated costs, then confirm again."); return;
    }
    inFlight.current = true; setSending(true); setError(null); stopRef.current(); speechRef.current.stop();
    const frozenIntent = { ...preview };
    try {
      const signature = await onSend(frozenIntent);
      setPreview(null);
      if (signature) { setSuccess({ signature, ...frozenIntent }); setCommand(""); setRequest(null); }
      else setError("No confirmation yet. Check the wallet notice and activity before trying again.");
    } catch (e) { setError(friendlyError(e)); }
    finally { inFlight.current = false; setSending(false); }
  }, [preview, busy, currentQuote, onSend]);

  const handleCommand = useCallback((text: string) => {
    if (!address || busy || inFlight.current || speechRef.current.active()) return;
    setError(null); setResponse(null);
    const read = readOnlyCommand(text);
    if (read === "balance") {
      setResponse("Last fetched balances: " + Object.entries(balances).map(([token, amount]) => amount === null ? token + " unavailable" : amount.toLocaleString("en-US", { maximumFractionDigits: token === "SOL" ? 9 : 6 }) + " " + token).join(", ") + ". Devnet tokens have no real value."); return;
    }
    if (read === "contacts") { setResponse(contacts.length ? "Your saved contacts: " + contacts.slice(0, 8).map(c => c.name).join(", ") + (contacts.length > 8 ? ", and more in your contact book." : ".") : "No contacts yet. Add a name and wallet address in Contacts."); return; }
    if (read === "help") { setResponse("Try: Send 0.1 SOL to mom. Pay five USDC to alice. What is my balance? Show contacts. During review: Change amount to 0.05, or cancel. Payments always need separate approval."); return; }
    if (isCancellation(text)) { setPreview(null); setResponse("Payment cancelled. Nothing was sent."); stopRef.current(); speechRef.current.stop(); return; }
    try {
      if (preview) {
        if (isConfirmation(text)) { void confirm(); return; }
        const revised = reviseAmount(text, preview);
        if (revised) { setPreview(revised); setCommand(""); stopRef.current(); return; }
        throw new Error("Say ‘confirm’, ‘cancel’, or ‘change amount to 0.05’. Use Edit payment to change the recipient or asset.");
      }
      const intent = resolveIntent(parseIntent(text), contacts);
      if (intent.address === address) throw new Error("Choose a recipient other than this demo wallet.");
      setPreview(intent); setSuccess(null); setCommand(""); stopRef.current();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't understand that command."); }
  }, [address, busy, contacts, preview, confirm, balances]);
  const voice = useVoice(handleCommand);
  const stopListening = voice.stopListening;
  stopRef.current = stopListening;
  useEffect(() => { if (busy) { stopListening(); speechRef.current.stop(); } }, [busy, stopListening]);
  const disabled = !address || busy || sending || readback.speaking;
  const say = (text: string) => { voice.stopListening(); readback.speak(text); };
  const edit = () => {
    if (!preview) return;
    voice.stopListening(); readback.stop();
    setCommand(commandForIntent(preview));
    setPreview(null); setError(null);
    window.setTimeout(() => commandRef.current?.focus(), 0);
  };

  return <Card id="payment-panel" className="relative scroll-mt-24 overflow-hidden p-5 sm:p-7">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(153,69,255,.07),transparent_70%)]" />
    <div className="relative flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-medium">Send a payment</h2>
      <div aria-label="Payment input method" className="flex rounded-lg border border-white/10 bg-black/20 p-1">
        {(["voice", "form"] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} className={"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] " + (mode === item ? "bg-white/10 text-white" : "text-muted")} disabled={busy || sending} onClick={() => { voice.stopListening(); readback.stop(); setMode(item); }}>{item === "voice" ? <Mic size={12} /> : <Keyboard size={12} />}{item === "voice" ? "Speak" : "Type"}</button>)}
      </div>
    </div>
    {request && !success && <div className="relative mt-5 rounded-xl border border-purple/25 bg-purple/5 p-4 text-xs leading-6"><p className="font-medium text-[#cfb3f4]">Payment request · Devnet</p><p>{request.amount} {request.token} to <span className="font-mono">{truncate(request.recipient)}</span></p><p className="mt-1 text-[11px] text-muted">Verify the amount and full address at review. This link is not proof of identity.</p>{!preview && <Button className="mt-3" size="sm" disabled={disabled} onClick={() => handleCommand(commandForIntent(request))}>Review request<ArrowRight size={12} /></Button>}</div>}
    {requestError && <p role="alert" className="mt-4 text-xs text-red-300">{requestError}</p>}
    {mode === "voice" ? <>
      <div className="relative flex flex-col items-center pb-6 pt-9">
        <button type="button" className={"mic-button " + (voice.isListening ? "listening" : "")} disabled={disabled || !voice.supported} aria-label={voice.isListening ? "Stop listening" : preview ? "Speak to confirm or change payment" : "Start voice command"} aria-pressed={voice.isListening} onClick={() => { if (voice.isListening) voice.stopListening(); else if (!speechRef.current.active()) voice.startListening(); }}>{voice.isListening ? <Square size={25} fill="currentColor" /> : <Mic size={30} strokeWidth={1.6} />}</button>
        <p className="mt-7 text-sm font-medium">{sending ? "Sending your whisper…" : readback.speaking ? "Reading it back…" : voice.isListening ? "I’m listening…" : preview ? "Review. Correct. Confirm." : "Your wallet, in your words."}</p>
        <p className="mt-2 text-center text-xs leading-5 text-muted">{!address ? "Create your demo wallet to get started." : !voice.supported ? "Voice isn’t supported here. Use Type or the command box." : preview ? "Tap the mic to confirm, cancel, or change the amount." : "Try ‘Pay five USDC to alice’ or ‘What is my balance?’"}</p>
      </div>
      <div className="rounded-xl border border-white/[.06] bg-black/20 px-4 py-3"><p className="text-[9px] tracking-[.12em] text-muted/70">LIVE TRANSCRIPT · ENGLISH</p><p aria-live="polite" className={"mt-3 min-h-6 break-words text-sm " + (voice.transcript ? "text-white" : "text-muted/50")}>{voice.transcript || "Your words will appear here…"}</p><div aria-hidden="true" className={"wallet-wave mt-2 " + (voice.isListening ? "active" : "")}>{Array.from({ length: 35 }, (_, i) => <span key={i} />)}</div></div>
    </> : !preview && <PaymentForm contacts={contacts} disabled={disabled} onReview={handleCommand} />}
    {!preview && <div className="mt-4 flex flex-wrap gap-2">{["What is my balance?", "Show contacts", "Help"].map(example => <button key={example} type="button" disabled={disabled} onClick={() => handleCommand(example)} className="rounded-full border border-white/10 px-3 py-2 text-[10px] text-muted hover:border-purple/40 hover:text-white disabled:opacity-40">{example}</button>)}</div>}
    {response && <div role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs leading-6 text-white/80">{response}</p>{readback.supported && <Button variant="ghost" size="sm" className="mt-2" disabled={busy || voice.isListening} onClick={() => readback.speaking ? readback.stop() : say(response)}><Volume2 size={13} />{readback.speaking ? "Stop readback" : "Read aloud"}</Button>}</div>}
    {(error || voice.error || readback.error) && <p role="alert" className="mt-4 rounded-xl border border-red-400/15 bg-red-400/5 px-4 py-3 text-xs leading-5 text-red-200">{error || voice.error || readback.error}</p>}
    {preview && <div className="mt-5 overflow-hidden rounded-2xl border border-purple/25 bg-purple/[.035]">
      <div className="p-5">
        <div className="mb-5 flex items-center justify-between"><h3 ref={reviewRef} tabIndex={-1} className="text-[10px] tracking-[.13em] text-[#c0a2e8]">REVIEW YOUR PAYMENT</h3><ShieldCheck size={15} className="text-[#c0a2e8]" /></div>
        <p className="text-xs text-muted">You will send</p><p className="mt-1 text-3xl font-medium tracking-tight">{preview.amount} <span className="text-lg text-muted">{preview.token}</span></p>
        <p className="mt-2 text-sm">to <span className="font-medium text-[#c6a8ee]">{preview.recipient.length > 25 ? truncate(preview.recipient) : preview.recipient}</span></p>
        <div className="mt-4 rounded-lg border border-white/5 bg-black/20 p-3"><p className="mb-1 text-[9px] text-muted">FULL RECIPIENT ADDRESS · VERIFY BEFORE SENDING</p><p className="break-all font-mono text-[11px] leading-5 text-white/80">{preview.address}</p><p className="mt-2 text-[10px] text-muted">{contacts.some(c => c.address === preview.address) ? "Address is in your saved contacts. Default demo contacts may be test destinations." : "New recipient. Verify this address with the person you intend to pay."}</p></div>
        <div aria-live="polite" className="my-4 rounded-xl border border-white/5 bg-black/15 p-3 text-[11px]">
          <div className="mb-3 flex items-center justify-between"><span className="text-muted">Solana Devnet · Cost estimate</span><button type="button" aria-label="Refresh payment estimate" disabled={busy || sending || !currentQuote} onClick={() => { setQuote(null); setQuoteRevision(n => n + 1); }} className="p-1 text-muted hover:text-white disabled:opacity-30"><RefreshCw size={12} /></button></div>
          {!currentQuote ? <p className="flex items-center gap-2 text-muted"><Loader2 size={12} className="animate-spin" />Checking balance and fees…</p> : currentQuote.error ? <p className="leading-5 text-amber-200">{currentQuote.error}</p> : currentQuote.data && <dl className="space-y-2"><div className="flex justify-between gap-2"><dt className="text-muted">Network fee</dt><dd>{sol(currentQuote.data.feeLamports)} SOL</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">New token account rent</dt><dd>{sol(currentQuote.data.rentLamports)} SOL</dd></div><div className="flex justify-between gap-2 border-t border-white/5 pt-2"><dt className="text-muted">Total SOL debit</dt><dd>{sol(currentQuote.data.totalSolLamports)} SOL</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">SOL remaining</dt><dd>{sol(currentQuote.data.remainingSolLamports)} SOL</dd></div></dl>}
          <p className="mt-3 text-[9px] leading-4 text-muted/70">Estimate only. Network state can change; the transaction is checked again before sending. {preview.token !== "SOL" && preview.amount + " " + preview.token + " is debited separately."}</p>
        </div>
        <div className="mb-4 flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={busy || sending} onClick={edit}><Pencil size={12} />Edit payment</Button>{readback.supported && <Button variant="ghost" size="sm" disabled={busy || sending || voice.isListening} onClick={() => readback.speaking ? readback.stop() : say("Payment review. Send " + preview.amount + " " + preview.token + " to " + (preview.recipient.length > 25 ? "the wallet shown on screen" : preview.recipient) + ". Address ending " + preview.address.slice(-6).split("").join(" ") + ". Solana Devnet only. Nothing has been sent.")}><Volume2 size={13} />{readback.speaking ? "Stop readback" : "Read payment aloud"}</Button>}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" disabled={busy || sending} onClick={() => { voice.stopListening(); readback.stop(); setPreview(null); setError(null); }} className="px-4"><X size={14} />Cancel</Button><Button disabled={disabled || !currentQuote?.data} onClick={() => void confirm()} className="flex-1 bg-mint text-black hover:bg-mint/85">{sending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Confirm & Send</Button></div>
      </div><p className="border-t border-white/5 px-5 py-3 text-center text-[10px] text-muted">Separate approval. No automatic payments.</p>
    </div>}
    {!preview && success && <div role="status" className="mt-5 rounded-2xl border border-mint/20 bg-mint/5 p-5 text-center"><CircleCheck size={30} className="mx-auto mb-3 text-mint" /><h3 className="text-lg font-medium">A whisper, delivered.</h3><p className="mt-2 text-xs text-muted">Sent {success.amount} {success.token} to {success.recipient.length > 25 ? truncate(success.recipient) : success.recipient}.</p><a href={explorerUrl(success.signature)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-mint">View {truncate(success.signature)} on Solscan<ArrowUpRight size={13} /></a><div><Button variant="ghost" size="sm" className="mt-3" onClick={() => setSuccess(null)}>Make another payment<ArrowRight size={13} /></Button></div></div>}
    <form className="mt-5" onSubmit={e => { e.preventDefault(); voice.stopListening(); handleCommand(command); }}>
      <label htmlFor="voice-command" className="field-label flex items-center gap-1.5"><Keyboard size={12} />{preview ? "Correct the amount or type a command" : "Or type a command"}</label>
      <div className="flex gap-2"><Input ref={commandRef} id="voice-command" value={command} onChange={e => setCommand(e.target.value)} placeholder={preview ? "Change amount to 0.05" : "Pay five USDC to alice"} disabled={disabled} autoComplete="off" spellCheck={false} maxLength={180} required /><Button type="submit" size="icon" className="h-11 w-11 shrink-0" variant="outline" aria-label="Run typed command" disabled={disabled || !command.trim()}><ArrowRight size={16} /></Button></div>
    </form>
    <p className="mt-4 text-center text-[10px] leading-5 text-muted/70">Speech uses your browser’s voice services. The mic is disabled during readback.<br />Voice approval recognizes words, not your identity.</p>
  </Card>;
}
