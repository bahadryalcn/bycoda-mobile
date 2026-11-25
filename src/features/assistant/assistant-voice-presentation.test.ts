import { expect, it, vi } from "vitest";
import { assistantMicrophoneLevel, assistantOrbState, assistantVoiceRequested, AssistantTranscriptPreference, TRANSCRIPT_VISIBILITY_KEY } from "./assistant-voice-presentation";

it("only the explicit voice=1 entry requests a call", () => {
  expect(assistantVoiceRequested("1")).toBe(true);
  for (const value of [undefined, "0", "true", "", ["1"]]) expect(assistantVoiceRequested(value)).toBe(false);
});
it("maps call phases independently from microphone mute", () => {
  expect(assistantOrbState("idle", false, undefined)).toBe("idle");
  expect(assistantOrbState("listening", false, undefined)).toBe("listening");
  expect(assistantOrbState("sending", false, undefined)).toBe("thinking");
  expect(assistantOrbState("starting", false, undefined)).toBe("thinking");
  expect(assistantOrbState("speaking", false, undefined)).toBe("speaking");
  expect(assistantOrbState("listening", true, undefined)).toBe("muted");
  expect(assistantOrbState("sending", true, undefined)).toBe("thinking");
  expect(assistantOrbState("speaking", true, undefined)).toBe("speaking");
  expect(assistantOrbState("muted", true, new Error("failed"))).toBe("error");
});
it("measures actual PCM energy and bounds silence and clipping", () => {
  expect(assistantMicrophoneLevel(new Int16Array())).toBe(0);
  expect(assistantMicrophoneLevel(new Int16Array([0, 0]))).toBe(0);
  expect(assistantMicrophoneLevel(new Int16Array([4096, -4096]))).toBe(0.5);
  expect(assistantMicrophoneLevel(new Int16Array([32767, -32768]))).toBe(1);
});
it("defaults transcript to hidden and restores an explicit device choice", async () => {
  const getItem = vi.fn().mockResolvedValue(null), setItem = vi.fn().mockResolvedValue(undefined);
  const preference = new AssistantTranscriptPreference({ getItem, setItem });
  expect(await preference.load()).toBe(false);
  getItem.mockResolvedValue("true"); expect(await preference.load()).toBe(true);
  getItem.mockResolvedValue("invalid"); expect(await preference.load()).toBe(false);
  await preference.save(true);
  expect(setItem).toHaveBeenCalledWith(TRANSCRIPT_VISIBILITY_KEY, "true");
});
it("keeps taps ahead of a late storage read and serializes rapid changes", async () => {
  let resolve!: (value: string) => void;
  const setItem = vi.fn().mockResolvedValue(undefined);
  const preference = new AssistantTranscriptPreference({ getItem: () => new Promise(done => { resolve = done; }), setItem });
  const read = preference.load(); const first = preference.save(true), second = preference.save(false);
  resolve("true"); expect(await read).toBeUndefined(); await Promise.all([first, second]);
  expect(setItem.mock.calls.map(call => call[1])).toEqual(["true", "false"]);
});
it("tolerates unavailable storage and allows later saves", async () => {
  const setItem = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const preference = new AssistantTranscriptPreference({ getItem: async () => { throw new Error("offline"); }, setItem });
  expect(await preference.load()).toBeUndefined();
  await preference.save(true); await preference.save(false); expect(setItem).toHaveBeenCalledTimes(2);
});
