"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOICE_SETTINGS, rankedVoices, readVoiceSettings, VOICE_SETTINGS_KEY, type VoiceSettings } from "@/lib/voice-settings";

export function useReadback() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState(DEFAULT_VOICE_SETTINGS);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (active.current) {
      active.current.onend = null; active.current.onerror = null;
      active.current = null; window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);
  useEffect(() => {
    setSettings(readVoiceSettings());
    const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    setSupported(available);
    if (!available) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh(); window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      if (timer.current) clearTimeout(timer.current);
      if (active.current) {
        active.current.onend = null; active.current.onerror = null; active.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  const updateSettings = (patch: Partial<VoiceSettings>) => {
    stop(); setError(null);
    const next = { ...settings, ...patch }; setSettings(next);
    try { localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next)); }
    catch { /* Preferences can remain in memory when storage is blocked. */ }
  };
  const availableVoices = rankedVoices(voices, settings.language);
  const selectedVoice = availableVoices.find(voice => voice.voiceURI === settings.voiceURI) ?? availableVoices[0];
  const speak = useCallback((text: string) => {
    if (!supported) return;
    stop(); setError(null);
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = selectedVoice?.lang ?? settings.language;
    utterance.rate = settings.rate;
    active.current = utterance;
    const finish = () => {
      if (active.current !== utterance) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null; active.current = null; setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = () => { if (active.current === utterance) { finish(); setError("Voice playback is unavailable. You can read the reply and type your answer."); } };
    setSpeaking(true);
    // Always leave a way back to input when a browser never emits a playback event.
    timer.current = setTimeout(() => { stop(); setError("Voice playback timed out. Try Preview voice or choose a different voice."); }, 60_000);
    try { window.speechSynthesis.speak(utterance); }
    catch { finish(); setError("Voice playback is unavailable. Review the reply on screen."); }
  }, [stop, supported, selectedVoice, settings.language, settings.rate]);
  return { supported, speaking, speak, stop, error, settings, updateSettings, voices: availableVoices, selectedVoice, isSpeaking: () => active.current !== null };
}
