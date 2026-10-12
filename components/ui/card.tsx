import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-2xl border border-white/[0.08] bg-surface/80 backdrop-blur-xl", className)} {...props} />;
}
