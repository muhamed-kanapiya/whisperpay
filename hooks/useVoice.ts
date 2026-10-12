"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { speechSession, type Recognition } from "@/lib/speech-session";

declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}

export function useVoice(onFinal?: (text: string) => void, language = "en-US") {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const finalCallback = useRef(onFinal);
  finalCallback.current = onFinal;
  const stopListening = useCallback(() => {
    cancelRef.current?.(); cancelRef.current = null; setIsListening(false); setError(null);
  }, []);
  useEffect(() => {
    setSupported(!!(window.SpeechRecognition ?? window.webkitSpeechRecognition));
    return () => { cancelRef.current?.(); cancelRef.current = null; };
  }, []);
  const startListening = useCallback(() => {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor || cancelRef.current) return;
    if (!window.isSecureContext) { setError("Microphone access requires HTTPS or localhost. You can type a command instead."); return; }
    setError(null); setTranscript(""); setAlternatives([]);
    const recognition = new Constructor();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    cancelRef.current = speechSession(recognition, {
      transcript: setTranscript,
      final: (text, choices) => { setAlternatives(choices); finalCallback.current?.(text); },
      end: () => { cancelRef.current = null; setIsListening(false); },
      error: code => {
        if (code === "aborted") return;
        const errors: Record<string, string> = {
          "not-allowed": "Microphone access was denied. Enable it in your browser, or type below.",
          "audio-capture": "No microphone found. Connect one, or type below.",
          "no-speech": "I didn't hear anything. Tap the mic and try again, or type your answer.",
          "network": "Speech recognition couldn't connect. Your payment draft is still here; type your answer.",
          "service-not-allowed": "Speech recognition isn't available in this browser. Type below.",
        };
        setError(errors[code] ?? "Couldn't recognize your voice. Try again, or type below.");
      },
    });
    try { recognition.start(); setIsListening(true); }
    catch { stopListening(); setError("The microphone couldn't start. Try again in a moment, or type below."); }
  }, [language, stopListening]);
  return { isListening, transcript, alternatives, startListening, stopListening, supported, error };
}
