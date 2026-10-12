import { describe, expect, it, vi } from "vitest";
import { speechSession, type Recognition, type SpeechEvent } from "../lib/speech-session";
const event = (text: string, isFinal = true, alternative?: string): SpeechEvent => ({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: alternative ? 2 : 1, 0: { transcript: text }, 1: { transcript: alternative ?? text } } } });
function setup() {
  const recognition: Recognition = { lang: "en-US", continuous: false, interimResults: true, maxAlternatives: 3, onresult: null, onerror: null, onend: null, start: vi.fn(), stop: vi.fn(), abort: vi.fn() };
  const calls = { transcript: vi.fn(), final: vi.fn(), error: vi.fn(), end: vi.fn() };
  const cancel = speechSession(recognition, calls);
  return { recognition, calls, cancel };
}
describe("speech recognition turn boundaries", () => {
  it("waits for mic release before replying and delivers a final only once", () => {
    const { recognition, calls } = setup();
    recognition.onresult!(event("send 0.1 SOL to mom", false));
    expect(calls.final).not.toHaveBeenCalled();
    recognition.onresult!(event("send 0.1 SOL to mom"));
    const duplicate = recognition.onresult!;
    const end = recognition.onend!;
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(calls.final).not.toHaveBeenCalled();
    end(); duplicate(event("confirm")); end();
    expect(calls.final).toHaveBeenCalledExactlyOnceWith("send 0.1 SOL to mom", []);
    expect(calls.end.mock.invocationCallOrder[0]).toBeLessThan(calls.final.mock.invocationCallOrder[0]);
  });
  it("invalidates queued confirmation callbacks on cancellation or readback", () => {
    const { recognition, calls, cancel } = setup();
    const lateResult = recognition.onresult!;
    const lateEnd = recognition.onend!;
    recognition.onresult!(event("confirm"));
    cancel(); lateResult(event("confirm")); lateEnd();
    expect(calls.final).not.toHaveBeenCalled();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });
  it("shows alternatives without substituting an approval", () => {
    const { recognition, calls } = setup();
    recognition.onresult!(event("don't confirm", true, "confirm"));
    recognition.onend!();
    expect(calls.final).toHaveBeenCalledExactlyOnceWith("don't confirm", ["confirm"]);
  });
  it("doesn't promote interim text or failed recognition into approval", () => {
    const { recognition, calls } = setup();
    recognition.onresult!(event("confirm", false)); recognition.onend!();
    expect(calls.final).not.toHaveBeenCalled();
    const failed = setup();
    failed.recognition.onresult!(event("confirm"));
    failed.recognition.onerror!({ error: "network" }); failed.recognition.onend!();
    expect(failed.calls.final).not.toHaveBeenCalled();
  });
});
