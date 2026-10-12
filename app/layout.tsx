import type { Metadata, Viewport } from "next";
import { APP_BASE_PATH } from "@/lib/deployment";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WhisperPay — Just whisper to pay.", template: "%s | WhisperPay" },
  description: "Speak payments, send SOL and test USDC, and share payment requests. A voice-controlled Solana Devnet wallet with a review before every send.",
  applicationName: "WhisperPay",
  icons: { icon: `${APP_BASE_PATH}/icon.svg` },
  openGraph: { title: "WhisperPay — Just whisper to pay.", description: "Your voice. Your wallet. A new way to pay on Solana Devnet.", type: "website", locale: "en_US" },
};
export const viewport: Viewport = { themeColor: "#07070A", colorScheme: "dark" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a href="#main" className="skip-link">Skip to content</a>{children}</body></html>;
}
