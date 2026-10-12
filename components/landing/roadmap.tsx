import Link from "next/link";
import { ArrowUpRight, Check, Mic, ShieldCheck } from "lucide-react";
import { GITHUB_URL } from "@/lib/utils";

const phases = [
  {
    step: "01", status: "Live on Devnet", title: "A payment you can talk through",
    description: "Speak or type a payment, answer the assistant’s questions, review the costs, and confirm separately.",
    details: ["SOL, test USDC, and WHISPER transfers", "Contacts, payment links, and transaction history"],
    live: true,
  },
  {
    step: "02", status: "Devnet prototype", title: "Voice-guided corporate actions",
    description: "A bond issuer desk with holder snapshots, coupon distributions, partial redemption, and maturity settlement. Test cash transfers and bond burns have been verified on Solana Devnet.",
    details: ["Public transaction receipts and downloadable audit evidence", "Next: program-enforced entitlements, institutional signing, and transferable record dates"],
    live: true,
  },
  {
    step: "03", status: "Next", title: "A wallet that explains your activity",
    description: "A dashboard for spending by token, recent payments, and frequent recipients. Ask a question and hear an answer based on your actual transactions.",
    details: ["“How much SOL did I send this week?”", "Answers with a time range and links to the matching transactions"],
    live: false,
  },
  {
    step: "04", status: "Planned", title: "More ways to request and pay",
    description: "QR payment requests, invoices, and split payments that help people settle up without losing track of the details.",
    details: ["Track requested, pending, and confirmed payments", "Review every recipient, amount, and fee before a split payment"],
    live: false,
  },
  {
    step: "05", status: "Research", title: "More natural voice. Stronger wallet access.",
    description: "Explore conversational voice models alongside wallet connections, passkeys, and recovery. Keep a free browser voice option available.",
    details: ["Evaluate voice quality, privacy, latency, and cost", "Security review and recovery testing before any mainnet release"],
    live: false,
  },
];

export function Roadmap() {
  return <section id="roadmap" aria-labelledby="roadmap-title" className="page-container scroll-mt-24 pb-24">
    <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="eyebrow">WHERE WHISPERPAY GOES NEXT</p><h2 id="roadmap-title" className="section-title">Useful today.<br /><span className="text-muted">More capable tomorrow.</span></h2></div>
      <p className="max-w-[330px] text-[13px] leading-6 text-muted">The Devnet demo is live. Next, Planned, and Research describe future work. Priorities may evolve with user feedback.</p>
    </div>
    <ol className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.015]">
      {phases.map(phase => <li key={phase.step} className="grid gap-5 border-b border-white/[.07] p-6 last:border-b-0 sm:p-8 md:grid-cols-[180px_1fr] md:gap-10">
        <div className="flex items-center gap-3 md:block"><span className="font-mono text-xs text-muted/50">/{phase.step}</span><p className={"flex items-center gap-2 text-[11px] font-medium md:mt-3 " + (phase.live ? "text-mint" : "text-[#c6a8ee]")}>{phase.live && <Check size={13} />}{phase.status}</p></div>
        <div><h3 className="text-lg font-medium tracking-tight sm:text-xl">{phase.title}</h3><p className="mt-3 max-w-[620px] text-xs leading-6 text-muted sm:text-[13px]">{phase.description}</p><ul className="mt-4 space-y-2">{phase.details.map(detail => <li key={detail} className="flex gap-2.5 text-[11px] leading-5 text-white/70"><span aria-hidden="true" className={"mt-2 size-1 shrink-0 rounded-full " + (phase.live ? "bg-mint/70" : "bg-purple/70")} />{detail}</li>)}</ul></div>
      </li>)}
    </ol>
    <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><p className="flex max-w-[530px] items-start gap-2 text-[11px] leading-5 text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-mint/70" />Every payment keeps a separate approval step. The current demo uses only Devnet test funds.</p><div className="flex shrink-0 gap-5 text-xs"><Link href="/app" className="inline-flex items-center gap-1.5 text-mint"><Mic size={13} />Try what’s live</Link><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted hover:text-white">Follow on GitHub<ArrowUpRight size={13} /></a></div></div>
  </section>;
}
