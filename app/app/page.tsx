import type { Metadata } from "next";
import { WalletApp } from "@/components/wallet/wallet-app";
export const metadata: Metadata = { title: "Demo Wallet", description: "Speak, confirm, and send on Solana Devnet. Free demo funds, real test-network transactions." };
export default function AppPage() { return <WalletApp />; }
