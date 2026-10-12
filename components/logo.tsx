import Link from "next/link";
import { cn } from "@/lib/utils";

export function WaveMark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("wave-mark", className)}><i /><i /><i /><i /><i /></span>;
}
export function Logo() {
  return <Link href="/" aria-label="WhisperPay home" className="inline-flex shrink-0 items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-purple/90 to-mint/60"><WaveMark /></span><span className="text-lg font-semibold tracking-[-0.7px]">whisper<span className="font-normal text-white/65">pay</span><span className="ml-0.5 text-mint">.</span></span></Link>;
}
export function SolanaMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 26" fill="none" aria-hidden="true" className={cn("h-5 w-6", className)}><path d="M7 1h25l-7 6H0l7-6Z" fill="#14F195" /><path d="M0 10h25l7 6H7l-7-6Z" fill="#9B77F3" /><path d="M7 19h25l-7 6H0l7-6Z" fill="#9945FF" /></svg>;
}
