"use client";
import { Volume2 } from "lucide-react";
import { SPEECH_LANGUAGES, type VoiceSettings } from "@/lib/voice-settings";
import { Button } from "../ui/button";

type Props = {
  supported: boolean; enabled: boolean; onToggle: () => void; speaking: boolean;
  busy: boolean; settings: VoiceSettings; voices: SpeechSynthesisVoice[];
  selectedVoice?: SpeechSynthesisVoice; update: (patch: Partial<VoiceSettings>) => void;
  preview: () => void; stop: () => void;
};
const selectClass = "mt-2 h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#111117] px-2 text-xs text-white focus:outline-purple";
export function VoiceSettingsPanel(props: Props) {
  return <div className="mt-5 rounded-xl border border-white/10 bg-white/[.025] p-3.5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-medium"><Volume2 size={14} className="text-mint" />Whisper assistant</p><p className="mt-1 text-[10px] text-muted">Guided payments, answers, and spoken reviews.</p></div>
      <button type="button" role="switch" aria-checked={props.enabled} disabled={!props.supported || props.busy} onClick={props.onToggle} className={"rounded-full border px-3 py-2 text-[10px] disabled:opacity-40 " + (props.enabled ? "border-mint/30 bg-mint/10 text-mint" : "border-white/10 text-muted")}>Spoken replies {props.enabled ? "on" : "off"}</button>
    </div>
    <details className="mt-3 border-t border-white/5 pt-3">
      <summary className="cursor-pointer text-[11px] text-muted hover:text-white">Voice & recognition settings</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-[11px] text-muted">Assistant voice
          <select aria-label="Assistant voice" className={selectClass} value={props.voices.some(v => v.voiceURI === props.settings.voiceURI) ? props.settings.voiceURI : ""} onChange={e => props.update({ voiceURI: e.target.value })} disabled={!props.supported || props.busy}>
            <option value="">Automatic{props.selectedVoice ? ` · ${props.selectedVoice.name}` : " · browser default"}</option>
            {props.voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
          </select>
        </label>
        {props.supported && !props.voices.length && <p className="text-[10px] leading-5 text-amber-200/80">Your browser hasn’t listed any English voices. Playback will use its default voice if available.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] text-muted">Listening accent<select aria-label="Listening accent" className={selectClass} value={props.settings.language} disabled={props.busy} onChange={e => props.update({ language: e.target.value })}>{SPEECH_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
          <label className="text-[11px] text-muted">Speaking pace<select aria-label="Speaking pace" className={selectClass} value={props.settings.rate} disabled={props.busy || !props.supported} onChange={e => props.update({ rate: Number(e.target.value) })}><option value="0.9">Relaxed</option><option value="1">Natural</option><option value="1.1">Brisk</option></select></label>
        </div>
        <Button variant="outline" size="sm" disabled={!props.supported || props.busy} onClick={props.speaking ? props.stop : props.preview}>{props.speaking ? "Stop speaking" : "Preview voice"}</Button>
        <p className="text-[10px] leading-5 text-muted">Voices come from your browser and device. Natural or enhanced voices are preferred when available. Pick the accent closest to your speech; say “point” clearly for decimals.</p>
      </div>
    </details>
    {props.speaking && <button type="button" onClick={props.stop} className="mt-3 text-xs text-mint">Stop speaking · continue on screen</button>}
  </div>;
}
