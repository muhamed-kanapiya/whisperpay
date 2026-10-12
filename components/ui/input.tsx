import { forwardRef } from "react";
import { cn } from "@/lib/utils";
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn("h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/20 px-3.5 text-sm text-white placeholder:text-muted/60 focus:border-purple/70 focus:outline-none focus:ring-2 focus:ring-purple/15 disabled:opacity-50", className)} {...props} />);
Input.displayName = "Input";
