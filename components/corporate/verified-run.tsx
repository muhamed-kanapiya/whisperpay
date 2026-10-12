"use client";
import { useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTIONS, ACTION_LABELS, calculateEntitlements, formatCash, type Instrument } from "@/lib/corporate/model";
import { readRegistry, verifySnapshot, verifyTerms } from "@/lib/corporate/solana";
import { connection, friendlyError } from "@/lib/solana";
import { APP_BASE_PATH } from "@/lib/deployment";
import { addressUrl, explorerUrl } from "@/lib/utils";
import auditData from "@/public/corporate/verified-audit.json";
import result from "@/public/corporate/verified-result.json";

const audit = auditData as Instrument;
export function VerifiedRun() {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const verify = async () => {
    if (busy) return;
    setBusy(true); setStatus(null);
    try {
      const signatures = ACTIONS.map(action => audit.receipts[action].signature);
      const response = await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true });
      if (response.value.some(receipt => !receipt || receipt.err || receipt.confirmationStatus !== "finalized")) throw new Error("One or more historical transactions could not be verified by this RPC.");
      await verifyTerms(audit);
      for (const action of ACTIONS) await verifySnapshot(audit, audit.snapshots[action]!);
      const registry = await readRegistry(audit);
      if (registry.supply !== 0n || registry.paid.some((amount, i) => amount.toString() !== result.paid[i])) throw new Error("Current balances differ from the recorded run. Inspect the explorer links.");
      setStatus(`Verified against Solana at finalized slot ${registry.slot}: all three actions succeeded, snapshot hashes match, and no bonds remain.`);
    } catch (error) { setStatus(friendlyError(error)); }
    finally { setBusy(false); }
  };
  return <section aria-label="Verified Devnet demonstration" className="mt-6 rounded-2xl border border-mint/20 bg-mint/[.035] p-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-medium text-mint"><Check size={15} />Completed Devnet demonstration</p><p className="mt-2 text-xs leading-6 text-muted">65,400 testUSD paid · 60 bonds retired · 3 corporate actions. Inspect real receipts without funding a wallet.</p></div><Button size="sm" variant="outline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide completed run" : "Inspect completed run"}<ExternalLink size={13} /></Button></div>
    {expanded && <div className="mt-5 border-t border-mint/10 pt-5"><div className="grid gap-3 md:grid-cols-3">{ACTIONS.map(action => {
      const snapshot = audit.snapshots[action]!;
      const total = calculateEntitlements(action, snapshot.holders).reduce((sum, row) => sum + row.total, 0n);
      return <div key={action} className="rounded-xl border border-white/10 bg-background/40 p-4"><h3 className="text-xs font-medium">{ACTION_LABELS[action]}</h3><p className="mt-3 text-xl">{formatCash(total)} <span className="text-xs text-muted">testUSD</span></p><p className="mt-2 text-[10px] text-muted">Record slot {snapshot.slot}</p><div className="mt-3 flex gap-4 text-[11px] text-mint"><a href={explorerUrl(audit.receipts[`snapshot-${action}`].signature)} target="_blank" rel="noreferrer">Snapshot ↗</a><a href={explorerUrl(audit.receipts[action].signature)} target="_blank" rel="noreferrer">Settlement ↗</a></div></div>;
    })}</div><div className="mt-4 flex flex-wrap items-center gap-4 text-xs"><Button size="sm" variant="outline" onClick={() => void verify()} disabled={busy}>{busy && <Loader2 size={13} className="animate-spin" />}{busy ? "Verifying receipts…" : "Verify against Solana"}</Button><a className="text-mint" href={`${APP_BASE_PATH}/corporate/verified-audit.json`} download>Download public audit</a><a className="text-muted" href={addressUrl(result.bondMint)} target="_blank" rel="noreferrer">Inspect retired bond mint ↗</a></div>
      {status && <p role="status" className="mt-4 text-xs leading-6 text-muted">{status}</p>}<p className="mt-4 text-[10px] leading-5 text-muted/70">Recorded result at finalized slot {result.slot}. Separate test issuer; this does not change your wallet or create your own instrument. A public RPC may rate-limit verification.</p>
    </div>}
  </section>;
}
