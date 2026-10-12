export const VOICE_SETTINGS_KEY = "whisperpay_voice";
export const SPEECH_LANGUAGES = [
  { code: "en-US", label: "English · US" }, { code: "en-GB", label: "English · UK" },
  { code: "en-IN", label: "English · India" }, { code: "en-AU", label: "English · Australia" },
] as const;
export type VoiceSettings = { voiceURI: string; rate: number; language: string };
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { voiceURI: "", rate: 1, language: "en-US" };
export function readVoiceSettings(): VoiceSettings {
  try {
    const value = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) ?? "null");
    return {
      voiceURI: typeof value?.voiceURI === "string" ? value.voiceURI : "",
      rate: [0.9, 1, 1.1].includes(value?.rate) ? value.rate : 1,
      language: SPEECH_LANGUAGES.some(item => item.code === value?.language) ? value.language : "en-US",
    };
  } catch { return DEFAULT_VOICE_SETTINGS; }
}
type Voice = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI" | "default">;
export function rankedVoices<T extends Voice>(voices: T[], language: string): T[] {
  const score = (voice: Voice) => (/natural|neural|premium|enhanced/i.test(voice.name) ? 100 : 0)
    + (/google/i.test(voice.name) ? 50 : 0) + (voice.lang.replace("_", "-") === language ? 20 : 0) + (voice.default ? 1 : 0);
  return voices.filter(voice => /^en[-_]/i.test(voice.lang) || voice.lang === "en")
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
