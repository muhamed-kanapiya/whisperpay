"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, AudioLines, Check, Mic, RotateCcw, ShieldCheck } from "lucide-react";
import { SolanaMark, WaveMark } from "../logo";

const heights = [10, 16, 11, 25, 17, 33, 21, 43, 30, 52, 38, 66, 48, 75, 53, 84, 59, 70, 43, 61, 36, 54, 32, 45, 25, 33, 17, 25, 14, 18, 10];
export function VoicePreview() {
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();
  return <div className="preview-scene">
    <div className="orbital orbital-one" /><div className="orbital orbital-two" /><div className="preview-halo" />
    <div className="absolute -top-1 right-1 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-[#16161d] px-3 py-2 text-[10px] text-white/80 shadow-xl sm:right-0"><SolanaMark className="h-3 w-4" /> Built on Solana</div>
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .7, delay: .15 }} className="voice-preview-card">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-purple/15 text-purple"><AudioLines size={17} /></span><span className="text-xs font-medium">Your voice. In motion.</span></div><span className="flex items-center gap-1.5 text-[9px] tracking-widest text-muted"><span className="size-1.5 rounded-full bg-mint" />PREVIEW</span></div>
      <div className="my-6 flex h-[104px] items-center justify-center gap-[5px] overflow-hidden" aria-hidden="true">{heights.map((height, i) => <motion.span key={i} className="w-[4px] shrink-0 rounded-full bg-gradient-to-t from-purple via-[#7e81df] to-mint" style={{ height }} animate={reducedMotion ? {} : { scaleY: playing ? [.4, 1, .6, 1.15, .4] : [.8, 1, .8], opacity: [.6, 1, .6] }} transition={{ duration: playing ? .7 : 2.5, repeat: Infinity, delay: i * .055 }} />)}</div>
      <div className="rounded-xl border border-white/[.07] bg-white/[.03] px-4 py-4"><div className="mb-2 flex items-center gap-1.5 text-[9px] tracking-[.14em] text-muted"><Mic size={11} /> YOU SAY</div><p className="text-[19px] font-medium tracking-[-.5px]">“Send <span className="text-[#cbb3ff]">0.1 SOL</span> to mom”</p></div>
      <div className="my-2 flex justify-center text-white/20"><span className="h-5 w-px bg-gradient-to-b from-purple/60 to-mint/60" /></div>
      <div className="flex items-center justify-between rounded-xl border border-mint/15 bg-gradient-to-r from-mint/[.08] to-mint/[.02] p-4"><div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-mint/10 text-mint"><Check size={15} /></span><div><p className="text-xs font-medium">{playing ? "Your words → a payment" : "Reviewed. Confirmed. Sent."}</p><p className="mt-1 text-[10px] text-muted">After your confirmation</p></div></div><ArrowUpRight size={15} className="text-mint" /></div>
      <div className="mt-5 flex items-center justify-between text-[9px] text-muted/70"><span className="flex items-center gap-1.5"><ShieldCheck size={11} /> Always in your control</span><button onClick={() => setPlaying(!playing)} aria-pressed={playing} className="flex items-center gap-1.5 rounded px-1 py-1 hover:text-white"><RotateCcw size={10} />{playing ? "Pause waveform" : "Play waveform"}</button></div>
    </motion.div>
    <div className="floating-receipt"><span className="flex size-9 items-center justify-center rounded-full bg-[#272131] text-[#ceb2ef]">M</span><div><p className="text-xs font-medium">A little love for mom<span className="ml-1 text-mint">↗</span></p><p className="mt-1 text-[10px] text-muted">0.1 SOL · Example payment</p></div><WaveMark className="ml-4 text-mint" /></div>
  </div>;
}
