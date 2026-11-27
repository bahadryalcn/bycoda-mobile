import { expect, it } from "vitest";
import { assistantMicrophoneLevel, assistantOrbState, assistantVoiceRequested } from "./assistant-voice-presentation";

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
