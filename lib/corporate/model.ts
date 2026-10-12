/** Integer-only demo bond accounting. Cash values are six-decimal test tokens. */
export const CASH_SCALE = 1_000_000n;
export const FACE_VALUE = 1_000n * CASH_SCALE;
export const COUPON_BPS = 1_000n;
export const PAYMENTS_PER_YEAR = 2n;
export const PARTIAL_BPS = 2_000n;
export const INITIAL_UNITS = [10, 20, 30] as const;
export const ACTIONS = ["coupon", "partial", "redemption"] as const;
export type CorporateAction = typeof ACTIONS[number];
export const ACTION_LABELS: Record<CorporateAction, string> = {
  coupon: "Coupon payment", partial: "20% partial redemption", redemption: "Maturity redemption",
};
export type Holder = { name: string; address: string; initialUnits: number };
export type Receipt = { signature: string; lastValidBlockHeight: number; status: "pending" | "confirmed" | "failed" };
export type Snapshot = {
  version: 1; instrument: string; action: CorporateAction; slot: number; blockTime: number;
  holders: { address: string; units: string }[];
};
export type Instrument = {
  version: 1; id: string; issuer: string; bondMint: string; cashMint: string;
  createdAt: number; maturityAt: number; holders: Holder[];
  receipts: Record<string, Receipt>; snapshots: Partial<Record<CorporateAction, Snapshot>>;
};
export type Entitlement = { address: string; units: bigint; burn: bigint; principal: bigint; coupon: bigint; total: bigint };

export function calculateEntitlements(action: CorporateAction, holders: Snapshot["holders"]): Entitlement[] {
  if (!ACTIONS.includes(action)) throw new Error("Unknown corporate action.");
  if (!holders.length || holders.length > 3 || new Set(holders.map(h => h.address)).size !== holders.length) throw new Error("Invalid holder registry.");
  return holders.map(holder => {
    if (!/^\d+$/.test(holder.units)) throw new Error("Bond quantities must be nonnegative integers.");
    const units = BigInt(holder.units);
    if (units > 60n) throw new Error("Quantity exceeds the demo instrument's supply.");
    const numerator = units * PARTIAL_BPS;
    if (action === "partial" && numerator % 10_000n !== 0n) throw new Error("Partial redemption must retire whole bonds; no silent rounding.");
    const burn = action === "redemption" ? units : action === "partial" ? numerator / 10_000n : 0n;
    const principal = burn * FACE_VALUE;
    const coupon = action === "partial" ? 0n : units * FACE_VALUE * COUPON_BPS / 10_000n / PAYMENTS_PER_YEAR;
    return { address: holder.address, units, burn, principal, coupon, total: principal + coupon };
  });
}

export function formatCash(value: bigint): string {
  const whole = value / CASH_SCALE;
  const fraction = (value % CASH_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function nextAction(receipts: Instrument["receipts"]): CorporateAction | null {
  return ACTIONS.find(action => receipts[action]?.status !== "confirmed") ?? null;
}

export function assertActionOrder(action: CorporateAction, receipts: Instrument["receipts"], chainTime: number, maturityAt: number) {
  if (Object.values(receipts).some(r => r.status === "pending")) throw new Error("Reconcile the pending transaction before continuing.");
  if (receipts.seal?.status !== "confirmed") throw new Error("Finish issuing and sealing the instrument first.");
  if (nextAction(receipts) !== action) throw new Error("This action is already complete or a prior action is still due.");
  if (action === "redemption" && chainTime < maturityAt) throw new Error("The instrument has not reached its demo maturity on Solana yet.");
}

export function snapshotJson(snapshot: Snapshot) {
  // Explicit ordering makes the published commitment reproducible after JSON export/import.
  return JSON.stringify({ version: 1, instrument: snapshot.instrument, action: snapshot.action, slot: snapshot.slot, blockTime: snapshot.blockTime,
    holders: snapshot.holders.map(h => ({ address: h.address, units: h.units })) });
}

export function corporateCommand(text: string): CorporateAction | "summary" | "holders" | "help" | "cancel" | null {
  const clean = text.toLowerCase().replace(/[?.!,]/g, "").trim();
  if (/^(cancel|stop|never mind)$/.test(clean)) return "cancel";
  if (/^(help|what can you do|show examples)$/.test(clean)) return "help";
  if (/^(show |tell me |what is |what's )?(the )?(summary|overview|instrument status)$/.test(clean)) return "summary";
  if (/^(show |who are |tell me )?(the )?(holders|bondholders|holder registry)$/.test(clean)) return "holders";
  if (/^(preview |prepare |calculate |show )?(the )?(coupon|coupon payment|coupon entitlements)$/.test(clean)) return "coupon";
  if (/^(preview |prepare |calculate |show )?(the )?(partial redemption|early redemption|20% redemption|twenty percent redemption)$/.test(clean)) return "partial";
  if (/^(preview |prepare |calculate |show )?(the )?(maturity redemption|final redemption|bond redemption)$/.test(clean)) return "redemption";
  return null;
}
