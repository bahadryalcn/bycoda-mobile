import { expect, it } from "vitest";
import { appendDictation, dictationBlock, dictationView } from "./dictation-model";

it("joins recognized speech to the draft with one space", () => {
  expect(appendDictation("", " hello ")).toBe("hello");
  expect(appendDictation("fix the bug", "in login")).toBe("fix the bug in login");
  expect(appendDictation("line one\n", "line two")).toBe("line one\nline two");
  expect(appendDictation("keep", "  ")).toBe("keep");
  expect(() => appendDictation("x".repeat(256_000), "y")).toThrow(/too long/);
});

it("blocks dictation with a reason and keeps a recording stoppable", () => {
  const base = { connected: true, capabilities: ["voice.local.v1"], engine: "local" as const, otherVoiceActive: false };
  expect(dictationBlock(base)).toBeNull();
  expect(dictationBlock({ ...base, connected: false })).toBe("no-computer");
  expect(dictationBlock({ ...base, engine: "cloud" })).toBe("update");
  expect(dictationBlock({ ...base, capabilities: undefined })).toBeNull();
  expect(dictationBlock({ ...base, otherVoiceActive: true })).toBe("busy");
  expect(dictationView("recording", "busy", true)).toMatchObject({ action: "stop", disabled: false, active: true });
});

it("moves through idle, preparing, recording and transcribing", () => {
  expect(dictationView("idle", null, false)).toMatchObject({ action: "start", disabled: false });
  expect(dictationView("idle", null, true).disabled).toBe(true);
  expect(dictationView("preparing", null, false)).toMatchObject({ disabled: true, busy: true });
  expect(dictationView("transcribing", null, false)).toMatchObject({ action: "transcribing", busy: true });
  expect(dictationView("idle", "update", false)).toMatchObject({ action: "update", disabled: true });
});
