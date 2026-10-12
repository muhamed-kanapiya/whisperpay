"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, CircleDollarSign, FileCheck2, Landmark, Loader2, Mic, RefreshCw, ShieldCheck, Square, Volume2, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { DemoWarning } from "@/components/demo-warning";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VerifiedRun } from "./verified-run";
import { useCorporate } from "@/hooks/useCorporate";
import { useVoice } from "@/hooks/useVoice";
import { useReadback } from "@/hooks/useReadback";
import { ACTIONS, ACTION_LABELS, INITIAL_UNITS, calculateEntitlements, corporateCommand, formatCash, nextAction, type CorporateAction } from "@/lib/corporate/model";
import { SETUP_STEPS } from "@/lib/corporate/solana";
import { addressUrl, explorerUrl, truncate } from "@/lib/utils";

const stepLabels = ["Create bond mint", "Fund test treasury", "Issue Investor A", "Issue Investor B", "Issue Investor C", "Seal registry"];
const time = (seconds: number) => new Date(seconds * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });

export function CorporateDesk() {
  const desk = useCorporate();
  const readback = useReadback();
  const [selected, setSelected] = useState<CorporateAction>("coupon");
  const [command, setCommand] = useState("");
  const [reply, setReply] = useState("I can explain the bond, show holder entitlements, and prepare a corporate action for your review.");
  const inputRef = useRef<HTMLInputElement>(null);
  const instrument = desk.instrument;
  const ready = instrument?.receipts.seal?.status === "confirmed";
  const complete = instrument && nextAction(instrument.receipts) === null;
  const activeSnapshot = desk.review?.snapshot ?? instrument?.snapshots[selected];
  const tableAction = desk.review?.snapshot?.action ?? selected;
  const illustrative = !activeSnapshot;
  const previewHolders = (instrument?.holders ?? INITIAL_UNITS.map((initialUnits, i) => ({ name: `Investor ${"ABC"[i]}`, initialUnits, address: `preview-${i}` }))).map(h => ({ address: h.address, units: String(tableAction === "redemption" ? h.initialUnits * .8 : h.initialUnits) }));
  const rows = calculateEntitlements(tableAction, activeSnapshot?.holders ?? previewHolders);
  const total = rows.reduce((sum, row) => sum + row.total, 0n);
  const burned = rows.reduce((sum, row) => sum + row.burn, 0n);
  const paidTotal = desk.registry?.paid.reduce((sum, value) => sum + value, 0n);
  const speakReply = (text: string, speak = false) => { setReply(text); if (speak) readback.speak(text); };
  const processCommand = (text: string, spoken = false) => {
    if (desk.busy || readback.isSpeaking()) return;
    const intent = corporateCommand(text);
    if (intent === "summary") speakReply(desk.registry ? `The finalized registry holds ${desk.registry.supply} outstanding bonds. Investors have received ${formatCash(paidTotal!)} test dollars. The treasury holds ${formatCash(desk.registry.treasury)} test dollars. These are Devnet tokens with no real value.` : "This demo issues 60 bonds across three investors. Each bond has a face value of one thousand test dollars and a ten percent annual coupon, paid semi-annually. Refresh the sealed registry for on-chain balances.", spoken);
    else if (intent === "holders") speakReply(desk.registry ? `At slot ${desk.registry.slot}, Investor A holds ${desk.registry.units[0]} bonds, Investor B holds ${desk.registry.units[1]}, and Investor C holds ${desk.registry.units[2]}.` : "The planned allocation is ten bonds to Investor A, twenty to Investor B, and thirty to Investor C. The live registry becomes available after issuance and finality.", spoken);
    else if (intent === "cancel") { desk.cancel(); speakReply("Review cancelled. No transaction was signed.", spoken); }
    else if (intent === "help") speakReply("Try: show summary, show holders, prepare coupon, prepare partial redemption, or prepare maturity redemption. Every on-chain action needs the review button.", spoken);
    else if (intent) {
      setSelected(intent);
      if (!ready) speakReply(`${ACTION_LABELS[intent]} is selected. The table shows illustrative entitlements. Finish issuing the instrument before capturing its record date.`, spoken);
      else { speakReply(`Checking ${ACTION_LABELS[intent].toLowerCase()} eligibility. Review the record date and every holder amount before confirming.`, spoken); void desk.prepareAction(intent); }
    } else speakReply("Try “show summary” or “prepare coupon”. I only understand the listed commands, and voice never signs a transaction here.", spoken);
  };
  const voice = useVoice(text => processCommand(text, true), readback.settings.language);
  const exportAudit = () => {
    if (!instrument) return;
    const blob = new Blob([JSON.stringify(instrument, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `whisperpay-bond-${instrument.id}-audit.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="min-h-screen bg-background"><SiteHeader wallet /><DemoWarning />
    <main id="main" className="page-container py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-mint"><Landmark size={14} />WhisperPay · Corporate Actions</div>
          <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">A bond’s lifecycle.<br /><span className="text-muted">One clear conversation.</span></h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">Identify holders. Calculate entitlements. Settle and retire bonds on Solana. A working desk for the KASE challenge, using test instruments only.</p></div>
        <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/app">Payment wallet <ArrowUpRight size={13} /></Link></Button><Button size="sm" variant="outline" onClick={() => void desk.refresh()} disabled={!desk.issuer || !!desk.busy}><RefreshCw size={13} />Refresh chain data</Button></div>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.025] px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mint" />DEVNET · testUSD has no monetary value</span>
        <span>{desk.issuer ? <>Issuer <a className="text-white underline-offset-4 hover:underline" href={addressUrl(desk.issuer)} target="_blank" rel="noreferrer">{truncate(desk.issuer)}</a> · {desk.balance === null ? "Balance unavailable" : `${desk.balance.toFixed(4)} SOL`}</> : "Connect by creating your browser demo wallet"}</span>
      </div>
      <VerifiedRun />
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Metric label={desk.registry ? "Outstanding bonds · finalized" : "Planned bond issue"} value={desk.registry ? desk.registry.supply.toString() : "60"} detail="10 / 20 / 30 investor allocation" />
        <Metric label="Semi-annual coupon" value="5%" detail="10% annual · 1,000 testUSD face value" />
        <Metric label={paidTotal === undefined ? "Settlement model" : "Paid to holders · finalized"} value={paidTotal === undefined ? "Atomic" : `${formatCash(paidTotal)}`} detail={paidTotal === undefined ? "Payout + bond burn + receipt in one transaction" : "testUSD · total across three investor accounts"} />
      </div>
      {desk.error && <div role="alert" className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">{desk.error} <a className="underline" href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Devnet faucet ↗</a></div>}
      {desk.notice && <p role="status" className="mt-5 rounded-xl border border-mint/20 bg-mint/5 p-4 text-sm text-mint">{desk.notice}</p>}
      {desk.busy && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted"><Loader2 className="animate-spin" size={16} />{desk.busy}</p>}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[.85fr_1.45fr]">
        <div className="space-y-6">
          <Card className="p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Demo instrument</h2><span className="rounded-full bg-purple/15 px-2.5 py-1 text-[10px] text-purple-200">WP BOND</span></div>
            <dl className="mt-5 space-y-3 text-xs"><Term label="Face value" value="1,000 testUSD per bond" /><Term label="Annual coupon" value="10% · semi-annual" /><Term label="Extra action" value="20% partial principal redemption" /><Term label="Maturity" value={instrument ? time(instrument.maturityAt) : "3 minutes after terms are prepared"} /><Term label="Registry" value="3 fixture investors · non-transferable" /></dl>
            <p className="mt-4 text-[11px] leading-5 text-muted">The clock is compressed for the demo. Coupon amounts represent full semi-annual periods, not interest accrued over three minutes. Redemption includes the final coupon.</p>
            {instrument && <div className="mt-4 flex gap-4 text-xs text-mint"><a href={addressUrl(instrument.bondMint)} target="_blank" rel="noreferrer">Bond mint ↗</a><a href={addressUrl(instrument.cashMint)} target="_blank" rel="noreferrer">testUSD mint ↗</a></div>}
            {!desk.issuer ? <Button asChild className="mt-5 w-full"><Link href="/app">Create / fund demo wallet <ArrowUpRight size={14} /></Link></Button> : !instrument ? <Button className="mt-5 w-full" disabled={!!desk.busy} onClick={() => void desk.create()}>Prepare demo instrument</Button> : !ready ? <>
              <ol className="mt-5 space-y-2 border-t border-white/10 pt-4">{SETUP_STEPS.map((step, index) => <li key={step} className="flex items-center justify-between gap-2 text-xs"><span className="text-muted">{index + 1}. {stepLabels[index]}</span><span className={instrument.receipts[step]?.status === "confirmed" ? "text-mint" : "text-muted"}>{instrument.receipts[step]?.status === "confirmed" ? <Check size={14} /> : instrument.receipts[step]?.status ?? "Not started"}</span></li>)}</ol>
              <Button className="mt-5 w-full" disabled={!!desk.busy || !!desk.review} onClick={() => void desk.prepareSetup()}>Review next setup step</Button>
            </> : <p className="mt-5 flex items-center gap-2 text-xs text-mint"><ShieldCheck size={15} />Fixed supply sealed on Solana</p>}
          </Card>
          <Card className="relative overflow-hidden p-6"><div className="pointer-events-none absolute -right-10 -top-20 h-40 w-40 rounded-full bg-purple/10 blur-3xl" /><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Ask Whisper</h2><span className="text-[10px] text-muted">Guided voice · Free</span></div>
            <p aria-live="polite" className="mt-4 min-h-20 text-sm leading-7 text-muted">{reply}</p>
            <div className="mt-4 flex items-center gap-2"><Button aria-label={voice.isListening ? "Stop corporate voice input" : "Start corporate voice input"} size="icon" variant="gradient" disabled={!voice.supported || !!desk.busy || readback.speaking} onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}>{voice.isListening ? <Square size={17} /> : <Mic size={17} />}</Button>
              <Button size="sm" variant="ghost" disabled={!readback.supported || voice.isListening} onClick={() => readback.speaking ? readback.stop() : readback.speak(reply)}>{readback.speaking ? <Square size={14} /> : <Volume2 size={14} />}{readback.speaking ? "Stop reply" : "Read reply"}</Button></div>
            {voice.isListening && <p className="mt-3 text-xs text-mint">{voice.transcript || "Listening…"}</p>}
            {(voice.error || readback.error) && <p role="alert" className="mt-3 text-xs text-amber-200">{voice.error || readback.error}</p>}
            <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); processCommand(command); setCommand(""); }}><label className="sr-only" htmlFor="corporate-command">Ask about corporate actions</label><input id="corporate-command" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none focus:border-mint" placeholder="Show summary…" value={command} onChange={event => setCommand(event.target.value)} disabled={!!desk.busy || voice.isListening || readback.speaking} /><Button size="sm" variant="outline" disabled={!!desk.busy || !command.trim() || voice.isListening || readback.speaking}>Ask</Button></form>
            <div className="mt-3 flex flex-wrap gap-2">{["Show summary", "Show holders", "Prepare coupon", "Prepare partial redemption"].map(example => <button key={example} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-muted transition hover:text-white disabled:opacity-40" disabled={!!desk.busy || readback.speaking || voice.isListening} onClick={() => processCommand(example)}>{example}</button>)}</div>
            <p className="mt-4 text-[10px] leading-5 text-muted/70">Replies use registry data and fixed commands. Browser voice quality varies by device. Voice prepares actions; the confirmation button signs.</p>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden"><div className="p-6 pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Corporate action workspace</h2><span className="text-[10px] uppercase tracking-wider text-mint">{complete ? "Lifecycle completed" : "Identify → Calculate → Settle"}</span></div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">{ACTIONS.map((action, index) => <button key={action} disabled={!!desk.busy || !!desk.review} onClick={() => setSelected(action)} className={`rounded-xl border p-3 text-left transition ${selected === action ? "border-mint/35 bg-mint/[.07]" : "border-white/10 bg-white/[.02]"}`}><span className="mb-2 block text-[10px] text-muted">0{index + 1} {instrument?.receipts[action]?.status === "confirmed" ? "· SETTLED" : ""}</span><span className="text-xs font-medium">{ACTION_LABELS[action]}</span></button>)}</div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{illustrative ? "Illustrative terms preview · not an on-chain snapshot" : `Record date ${time(activeSnapshot.blockTime)}`}</p>{activeSnapshot && <span className="font-mono text-[10px] text-mint">Slot {activeSnapshot.slot}</span>}</div>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[470px] text-left text-xs"><caption className="sr-only">{ACTION_LABELS[tableAction]} entitlements per holder</caption><thead className="border-y border-white/[.07] bg-white/[.02] text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-6 py-3 font-normal">Holder</th><th className="px-3 py-3 font-normal">Bonds</th><th className="px-3 py-3 font-normal">Coupon</th><th className="px-3 py-3 font-normal">Principal</th><th className="px-6 py-3 text-right font-normal">testUSD due</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.address} className="border-b border-white/[.05]"><td className="px-6 py-4"><span className="block">Investor {"ABC"[i]}</span>{instrument && <a className="mt-1 block font-mono text-[10px] text-muted" href={addressUrl(row.address)} target="_blank" rel="noreferrer">{truncate(row.address, 4)} ↗</a>}</td><td className="px-3 py-4">{row.units.toString()}</td><td className="px-3 py-4 text-muted">{formatCash(row.coupon)}</td><td className="px-3 py-4 text-muted">{formatCash(row.principal)}</td><td className="px-6 py-4 text-right font-medium text-mint">{formatCash(row.total)}</td></tr>)}</tbody></table></div>
            <div className="p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wider text-muted">Total entitlement</p><p className="mt-1 text-2xl font-medium">{formatCash(total)} <span className="text-sm font-normal text-muted">testUSD</span></p></div><div className="text-right text-xs text-muted">{burned > 0n ? <>{burned.toString()} bonds retired<br /><span className="mt-1 inline-block text-mint">Burn + payment in one transaction</span></> : <>Units × 1,000 × 10% ÷ 2<br /><span className="mt-1 inline-block">Integer arithmetic · 6 cash decimals</span></>}</div></div>
              <p className="mt-4 text-[11px] leading-5 text-muted">Record dates use the current finalized Solana slot and its block time. Historical balances are not reconstructed. Each action has one snapshot and one settlement receipt; repeat execution is blocked by its on-chain marker.</p>
              <Button className="mt-5 w-full sm:w-auto" disabled={!ready || !!desk.busy || !!desk.review || instrument?.receipts[selected]?.status === "confirmed"} onClick={() => void desk.prepareAction(selected)}><FileCheck2 size={15} />{instrument?.receipts[selected]?.status === "confirmed" ? "Settled on Devnet" : instrument?.receipts[`snapshot-${selected}`]?.status === "confirmed" ? "Review settlement" : "Capture record-date snapshot"}</Button>
            </div>
          </Card>
          {desk.review && <Card className="border-mint/30 bg-mint/[.035] p-6" aria-label="Corporate action confirmation"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Review · {desk.review.title}</h2><Button aria-label="Cancel corporate review" variant="ghost" size="icon" disabled={!!desk.busy} onClick={desk.cancel}><X size={16} /></Button></div><p className="mt-3 text-sm leading-7 text-muted">{desk.review.explanation}</p><p className="mt-3 text-xs leading-6 text-muted">Network fees and account rent are paid in Devnet SOL. The issuer controls redemption. Review expires after two minutes.</p><div className="mt-5 flex flex-wrap gap-3"><Button disabled={!!desk.busy || readback.speaking || voice.isListening} onClick={() => void desk.confirm()}><ShieldCheck size={15} />Confirm on Devnet</Button><Button variant="outline" disabled={!!desk.busy} onClick={desk.cancel}>Cancel</Button></div></Card>}
          <Card className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">On-chain audit trail</h2><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={!instrument} onClick={exportAudit}><ArrowDownToLine size={13} />Export audit</Button><Button variant="ghost" size="sm" disabled={!desk.issuer || !!desk.busy} onClick={() => inputRef.current?.click()}>Restore</Button></div></div>
            <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" aria-label="Restore corporate audit JSON" onChange={async event => { const file = event.target.files?.[0]; if (file && file.size < 200_000) await desk.restore(await file.text()); event.target.value = ""; }} />
            {!instrument || Object.keys(instrument.receipts).length === 0 ? <div className="py-10 text-center"><CircleDollarSign className="mx-auto text-muted/40" size={27} /><p className="mt-3 text-xs text-muted">Real transaction receipts appear here after signing.</p></div> : <ul className="mt-4 divide-y divide-white/[.06]">{Object.entries(instrument.receipts).reverse().map(([operation, receipt]) => <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs" key={operation}><span className="capitalize">{operation.replaceAll("-", " ")} <span className={`ml-2 text-[10px] ${receipt.status === "confirmed" ? "text-mint" : "text-amber-200"}`}>{receipt.status}</span></span><a className="font-mono text-muted hover:text-white" href={explorerUrl(receipt.signature)} target="_blank" rel="noreferrer">{truncate(receipt.signature)} ↗</a></li>)}</ul>}
            <p className="mt-3 text-[10px] leading-5 text-muted/70">Export includes public terms, holder snapshots, and transaction signatures; no private keys. Keep it before resetting the demo wallet.</p>
          </Card>
        </div>
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 p-5 text-xs leading-6 text-muted"><span className="font-medium text-white">Prototype boundaries.</span> Investors and the instrument are fixtures. testUSD simulates the cash leg; token transfers and burns are real Devnet transactions. This is an issuer-controlled client using Solana’s Token-2022, SPL Token, System and Memo programs. Entitlements and scheduling run in the client, not a custom audited program. There is no KASE, bank, custody or identity integration.</div>
    </main>
  </div>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="p-5"><p className="text-[10px] uppercase tracking-wider text-muted">{label}</p><p className="mt-3 text-3xl font-medium tracking-tight">{value}</p><p className="mt-2 text-[11px] leading-5 text-muted">{detail}</p></Card>; }
function Term({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-5"><dt className="text-muted">{label}</dt><dd className="text-right">{value}</dd></div>; }
