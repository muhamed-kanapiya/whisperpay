type SpeechResult = { isFinal: boolean; length: number; [index: number]: { transcript: string } };
export type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
export interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

/** One microphone turn. Abort invalidates callbacks, including queued final results. */
export function speechSession(recognition: Recognition, callbacks: {
  transcript: (text: string) => void;
  final: (text: string, alternatives: string[]) => void;
  error: (code: string) => void;
  end: () => void;
}) {
  let active = true;
  let final: { text: string; alternatives: string[] } | null = null;
  const detach = () => { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; };
  recognition.onresult = event => {
    if (!active || final || !event.results.length) return;
    const results = Array.from({ length: event.results.length }, (_, i) => event.results[i]);
    const text = results.map(result => result[0].transcript).join(" ").trim();
    callbacks.transcript(text);
    if (text && results.every(result => result.isFinal)) {
      // Alternatives are offered for explicit editing, never chosen to authorize a payment.
      const alternatives = results.length === 1 ? Array.from({ length: Math.min(results[0].length, 3) }, (_, i) => results[0][i].transcript.trim()).filter(value => value !== text) : [];
      final = { text, alternatives: [...new Set(alternatives)] };
      recognition.stop();
    }
  };
  recognition.onerror = event => { if (active) { final = null; callbacks.error(event.error); } };
  recognition.onend = () => {
    if (!active) return;
    active = false; detach(); callbacks.end();
    // Reply aloud only after the recognizer has released the mic.
    if (final) callbacks.final(final.text, final.alternatives);
  };
  return () => { active = false; final = null; detach(); recognition.abort(); };
}
