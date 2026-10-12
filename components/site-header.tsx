"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { GITHUB_URL } from "@/lib/utils";

export function SiteHeader({ wallet = false }: { wallet?: boolean }) {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/80 backdrop-blur-2xl">
    <div className="page-container flex h-[76px] items-center justify-between gap-3">
      <div className="flex items-center gap-4"><Logo /><span className="hidden rounded-md border border-white/10 px-2 py-1 text-[9px] font-medium tracking-[.14em] text-muted lg:inline-block">BETA</span></div>
      <nav aria-label="Main navigation" className="hidden items-center gap-8 text-[13px] text-muted md:flex"><Link href="/#how-it-works" className="nav-link">How it works</Link><Link href="/app" className="nav-link">Demo</Link><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="nav-link flex items-center gap-1">GitHub<ArrowUpRight size={12} /></a></nav>
      <div className="flex items-center gap-2"><Button asChild size="sm" className="rounded-lg"><Link href={wallet ? "/" : "/app"}><span className="hidden sm:inline">{wallet ? "Back to home" : "Launch App"}</span><span className="sm:hidden">{wallet ? "Home" : "Launch"}</span><ArrowUpRight size={14} /></Link></Button><Button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" size="icon" variant="ghost" className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</Button></div>
    </div>
    {open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="page-container flex flex-col gap-5 border-t border-white/5 py-5 text-sm md:hidden"><Link onClick={() => setOpen(false)} href="/#how-it-works">How it works</Link><Link onClick={() => setOpen(false)} href="/app">Live Demo</Link><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav>}
  </header>;
}
