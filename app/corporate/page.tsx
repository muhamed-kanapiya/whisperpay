import type { Metadata } from "next";
import { CorporateDesk } from "@/components/corporate/corporate-desk";

export const metadata: Metadata = { title: "Corporate Actions", description: "A voice-guided Solana Devnet prototype for bond coupons, early redemption, and maturity settlement." };
export default function CorporatePage() { return <CorporateDesk />; }
