"use client";
export function CommandExamples({ disabled, choose, recipient }: { disabled: boolean; choose: (text: string) => void; recipient: string }) {
  const groups = [
    { title: "Pay in one sentence", commands: [`Send zero point one SOL to ${recipient}`, `Could you send ${recipient} half a SOL?`, `Pay five USDC to ${recipient}`, `Transfer twenty five WHISPER to ${recipient}`] },
    { title: "Let me guide you", commands: ["Make a payment", `Send to ${recipient}`, "Send 0.1 SOL", "Send five"] },
    { title: "Ask your wallet", commands: ["How much do I have?", "Show contacts", "What can you do?"] },
    { title: "During payment review", commands: ["Change amount to zero point zero five", `Change recipient to ${recipient}`, "Use USDC", "Cancel"] },
  ];
  return <details className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
    <summary className="cursor-pointer text-xs text-white/80">Things you can say <span className="ml-1 text-muted">· 15 examples</span></summary>
    <p className="mt-3 text-[10px] leading-5 text-muted">Tap an example to edit it in the command box. Use your saved contact names. For a new recipient, paste the address once into Contacts.</p>
    <div className="mt-3 space-y-4">{groups.map(group => <div key={group.title}><p className="mb-2 text-[9px] uppercase tracking-wider text-muted">{group.title}</p><div className="flex flex-wrap gap-2">{group.commands.map(command => <button type="button" key={command} disabled={disabled} onClick={() => choose(command)} className="max-w-full rounded-lg border border-white/[.07] px-2.5 py-2 text-left text-[11px] leading-5 text-white/70 hover:border-purple/40 hover:text-white disabled:opacity-40">“{command}”</button>)}</div></div>)}</div>
    <p className="mt-4 text-[10px] leading-5 text-muted">After reviewing a complete payment, tap the mic and say exactly “confirm”, “yes”, or “send”. Keep approval separate from corrections.</p>
  </details>;
}
