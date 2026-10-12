"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechResult = { isFinal: boolean; [index: number]: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}

export function useVoice(onFinal?: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalCallback = useRef(onFinal);
  finalCallback.current = onFinal;

  useEffect(() => {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) return;
    setSupported(true);
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    let delivered = false;
    recognition.onresult = event => {
      const text = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript).join(" ").trim();
      setTranscript(text);
      if (!delivered && event.results[event.results.length - 1].isFinal) {
        delivered = true;
        setIsListening(false);
        recognition.stop();
        finalCallback.current?.(text);
      }
    };
    recognition.onerror = event => {
      setIsListening(false);
      if (event.error === "aborted") return;
      const errors: Record<string, string> = {
        "not-allowed": "Microphone access was denied. Enable it in your browser, or type a command below.",
        "audio-capture": "No microphone found. Connect one, or type your command below.",
        "no-speech": "Didn't hear anything. Try the microphone again, or type below.",
        "network": "Speech recognition couldn't connect. You can still type your command.",
        "service-not-allowed": "Speech recognition isn't available in this browser. Type a command below.",
      };
      setError(errors[event.error] ?? "Couldn't recognize your voice. Please try again.");
    };
    recognition.onend = () => { setIsListening(false); delivered = false; };
    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (!window.isSecureContext) { setError("Microphone access requires HTTPS or localhost. You can type a command instead."); return; }
    setError(null);
    setTranscript("");
    try { recognitionRef.current.start(); setIsListening(true); }
    catch { setError("The microphone is still closing. Try again in a moment."); }
  }, []);
  const stopListening = useCallback(() => {
    recognitionRef.current?.abort();
    setIsListening(false);
  }, []);
  return { isListening, transcript, startListening, stopListening, supported, error };
}
