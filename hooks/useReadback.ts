"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useReadback() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    if (active.current) {
      active.current.onend = null;
      active.current.onerror = null;
      active.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);
  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (active.current) {
        active.current.onend = null;
        active.current.onerror = null;
        active.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  const speak = useCallback((text: string) => {
    if (!supported) return;
    stop();
    setError(null);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = .95;
    active.current = utterance;
    const finish = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); } };
    utterance.onend = finish;
    utterance.onerror = () => { finish(); setError("Readback is unavailable. Review the payment on screen."); };
    setSpeaking(true);
    try { window.speechSynthesis.speak(utterance); }
    catch { finish(); setError("Readback is unavailable. Review the payment on screen."); }
  }, [stop, supported]);
  return { supported, speaking, speak, stop, error, isSpeaking: () => active.current !== null };
}
