import { describe, expect, it } from "vitest";
import { AssistantCallError, assistantCallErrorMessage, companionEndFailure, type AssistantCallFailure } from "./assistant-call-error";
import { HostWsError } from "@/remote/ws-connection";

const turkish = (tr: string) => tr;
const english = (_tr: string, en: string) => en;
const reasons: AssistantCallFailure[] = [
  "unlock", "message-pending", "native-unavailable", "connection-changed", "send-unreviewed", "project-unverified",
  "project-unavailable", "result-unknown", "reply-hidden", "stopped", "no-speech", "not-started",
  "audio-taken", "idle-timeout", "microphone-failed", "app-closed",
];

// The voice service ended calls on its own (focus loss, timeout) and the call closed with no reason shown.
it("names why the phone's voice service ended a call, but not the owner's own Stop", () => {
  expect(companionEndFailure("audio-interrupted")).toBe("audio-taken");
  expect(companionEndFailure("timeout")).toBe("idle-timeout");
  expect(companionEndFailure("capture-error")).toBe("microphone-failed");
  expect(companionEndFailure("task-removed")).toBe("app-closed");
  expect(companionEndFailure("stopped")).toBeUndefined();
});

describe("assistant call failure text", () => {
  it("translates every app-raised reason instead of printing the English message", () => {
    for (const reason of reasons) {
      const error = new AssistantCallError(reason);
      expect(assistantCallErrorMessage(error, english)).toBe(error.message);
      expect(assistantCallErrorMessage(error, turkish)).not.toBe(error.message);
    }
    expect(new Set(reasons.map(reason => assistantCallErrorMessage(new AssistantCallError(reason), turkish))).size).toBe(reasons.length);
  });

  it("keeps vetted diagnostics from other errors and never prints a non-Error object", () => {
    expect(assistantCallErrorMessage(new Error("Model file missing"), turkish)).toBe("Model file missing");
    expect(assistantCallErrorMessage({ code: 1 }, english)).toBe("Could not complete this action.");
    expect(assistantCallErrorMessage({ code: 1 }, turkish)).toBe("İşlem tamamlanamadı.");
  });
  // A call stopped at "Assistant reply" with only "result unknown"; the cause behind it was invisible on the phone.
  it("shows the underlying cause under an unknown send result", () => {
    const error = new AssistantCallError("result-unknown", new Error("Socket closed before the reply"));
    expect(assistantCallErrorMessage(error, english)).toBe("The message result is unknown. Review it in the conversation before speaking again.\nSocket closed before the reply");
  });
  // The phone's Wi-Fi dropped during transcription and the call said "check this command's result".
  it("names a dropped voice line outside the reply step instead of asking to check a command", () => {
    const fill = (_tr: string, en: string, values?: Record<string, string | number>) => en.replace("{p0}", String(values?.p0));
    for (const error of [new HostWsError("network"), new HostWsError("internal", true)])
      expect(assistantCallErrorMessage(error, fill, { stage: "transcription", computer: "bab" })).toBe("The connection dropped. Check that bab is on and on the same network as this phone, then try again.");
    expect(assistantCallErrorMessage(new HostWsError("internal", true), fill, { stage: "reply", computer: "bab" })).toBe("Connection interrupted. Check this command's result before trying again.");
  });
});
