import { ShieldCheck } from "lucide-react";
import { cn, DEMO_WARNING } from "@/lib/utils";
export function DemoWarning({ className }: { className?: string }) {
  return <div className={cn("flex items-center justify-center gap-2 border-y border-amber-200/[0.06] bg-amber-200/[0.025] px-4 py-2.5 text-center text-[10px] leading-relaxed tracking-wide text-amber-100/60 sm:text-[11px]", className)}><ShieldCheck size={13} className="shrink-0" /><p>{DEMO_WARNING}</p></div>;
}
