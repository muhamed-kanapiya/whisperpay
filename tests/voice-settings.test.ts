import { afterEach, describe, expect, it, vi } from "vitest";
import { rankedVoices, readVoiceSettings, DEFAULT_VOICE_SETTINGS } from "../lib/voice-settings";
afterEach(() => vi.unstubAllGlobals());
describe("browser voice preferences", () => {
  it("prefers available enhanced English voices without inventing unavailable ones", () => {
    const voices = [
      { name: "Basic", lang: "en-US", voiceURI: "basic", default: true },
      { name: "A Natural voice", lang: "en-US", voiceURI: "natural", default: false },
      { name: "Français Natural", lang: "fr-FR", voiceURI: "fr", default: false },
    ];
    expect(rankedVoices(voices, "en-US").map(v => v.voiceURI)).toEqual(["natural", "basic"]);
    expect(voices[0].voiceURI).toBe("basic");
    expect(rankedVoices([], "en-US")).toEqual([]);
  });
  it("recovers from blocked or corrupted browser preferences", () => {
    vi.stubGlobal("localStorage", { getItem: () => "not-json" });
    expect(readVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ rate: -10, language: "other", voiceURI: 5 }) });
    expect(readVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});
