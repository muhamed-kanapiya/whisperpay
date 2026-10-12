import Link from "next/link";
import { ArrowUpRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CorporateSection() {
  return <section id="corporate-actions" className="page-container py-20">
    <div className="relative overflow-hidden rounded-3xl border border-mint/15 bg-gradient-to-br from-mint/[.05] via-white/[.02] to-purple/[.07] p-7 sm:p-12">
      <div className="mb-5 flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-mint"><Landmark size={15} />New · Corporate actions prototype</div>
      <div className="grid gap-9 md:grid-cols-2"><div><h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Beyond a payment.<br /><span className="text-muted">The whole bond lifecycle.</span></h2><p className="mt-5 max-w-md text-sm leading-7 text-muted">A voice-guided issuer desk for the KASE challenge. Review eligible holders, calculate coupon entitlements, and prepare atomic settlements on Solana Devnet.</p><Button asChild className="mt-6"><Link href="/corporate">Explore Corporate Actions <ArrowUpRight size={15} /></Link></Button></div>
        <div className="space-y-4">{[["01", "Coupon payment", "Record-date snapshot → per-holder entitlement → testUSD payout."], ["02", "20% partial redemption", "Pay principal and burn the corresponding bonds in one transaction."], ["03", "Maturity settlement", "Redeem remaining principal, pay the final coupon, and retire the bonds."]].map(([number, title, detail]) => <div key={number} className="flex gap-4 rounded-xl border border-white/[.07] bg-background/30 p-4"><span className="text-xs text-mint">{number}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-1.5 text-xs leading-6 text-muted">{detail}</p></div></div>)}</div>
      </div><p className="mt-8 border-t border-white/[.07] pt-4 text-[10px] leading-5 text-muted">Demo instrument and fixture investors. testUSD simulates settlement cash. Issuer-controlled client; no KASE or banking integration. All on-chain operations use Solana Devnet.</p>
    </div>
  </section>;
}
