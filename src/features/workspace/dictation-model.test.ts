import { expect, it } from "vitest";
import { appendDictation, captureAllowed, dictationBlock, dictationEndedByInterruption, dictationExplainsBlock, DictationInterrupted, dictationInterruption, dictationView, insertDictation, recognizedDictation } from "./dictation-model";

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

it("inserts dictation at the cursor with smart spacing and moves the caret after it", () => {
  const at = (start: number, end = start) => ({ start, end });
  expect(insertDictation("", at(0), " hello ")).toEqual({ text: "hello", selection: at(5) });
  expect(insertDictation("fix the bug", at(11), "in login")).toEqual({ text: "fix the bug in login", selection: at(20) });
  // Between words: one space on each side, only where none is already.
  expect(insertDictation("fix bug", at(3), "the")).toEqual({ text: "fix the bug", selection: at(7) });
  expect(insertDictation("fixbug", at(3), "the")).toEqual({ text: "fix the bug", selection: at(8) });
  // Next to whitespace, opening brackets and closing punctuation: no extra space.
  expect(insertDictation("fix  bug", at(4), "the").text).toBe("fix the bug");
  expect(insertDictation("say ()", at(5), "hi").text).toBe("say (hi)");
  expect(insertDictation("done.", at(4), "now").text).toBe("done now.");
  // A selection is replaced; out-of-range cursors are clamped.
  expect(insertDictation("fix old bug", at(4, 7), "new").text).toBe("fix new bug");
  expect(insertDictation("abc", at(99), "d").text).toBe("abc d");
  expect(insertDictation("keep", at(2), "  ")).toEqual({ text: "keep", selection: at(2) });
  expect(() => insertDictation("x".repeat(256_000), at(0), "y")).toThrow(/too long/);
});

it("keeps capturing through Android focus loss while active and stops only on background or lock", () => {
  const covering = () => false;
  expect(captureAllowed({ status: "unlocked", appState: "active" }, covering)).toBe(true);
  // The shade, a permission dialog or a heads-up drop window focus but keep the app active.
  expect(captureAllowed({ status: "unlocked", appState: "active", windowFocused: false } as { status: string; appState: string }, covering)).toBe(true);
  expect(captureAllowed({ status: "unlocked", appState: "background" }, covering)).toBe(false);
  expect(captureAllowed({ status: "unlocked", appState: "inactive" }, covering)).toBe(false);
  expect(captureAllowed({ status: "unlocked", appState: "inactive" }, () => true)).toBe(true);
  expect(captureAllowed({ status: "locked", appState: "active" }, covering)).toBe(false);
  expect(dictationInterruption({ status: "locked" })).toMatchObject({ reason: "locked" });
  expect(dictationInterruption({ status: "unlocked" })).toBeInstanceOf(DictationInterrupted);
  expect(dictationInterruption({ status: "unlocked" }).reason).toBe("background");
});

it("names a block reason on tap, but a microphone only waiting for a send stays plainly disabled", () => {
  expect(dictationExplainsBlock(dictationView("idle", "no-computer", false))).toBe(true);
  expect(dictationExplainsBlock(dictationView("idle", "busy", false))).toBe(true);
  // Locked by a send or upload: the label is just "Dictate message", nothing to explain.
  expect(dictationExplainsBlock(dictationView("idle", null, true))).toBe(false);
  expect(dictationExplainsBlock(dictationView("idle", null, false))).toBe(false);
  expect(dictationExplainsBlock(dictationView("preparing", null, false))).toBe(false);
  expect(dictationExplainsBlock(dictationView("recording", "busy", true))).toBe(false);
});

it("says why a recording vanished when the recorder stopped itself on background or lock", () => {
  const covering = () => false;
  const active = { status: "unlocked", appState: "active" };
  expect(dictationEndedByInterruption("recording", "idle", { status: "unlocked", appState: "background" }, covering)?.reason).toBe("background");
  expect(dictationEndedByInterruption("preparing", "idle", { status: "locked", appState: "active" }, covering)?.reason).toBe("locked");
  // A normal end, a Discard while in front, or our own permission prompt explain nothing.
  expect(dictationEndedByInterruption("transcribing", "idle", active, covering)).toBeNull();
  expect(dictationEndedByInterruption("preparing", "idle", { status: "unlocked", appState: "inactive" }, () => true)).toBeNull();
  // Only the step into idle counts, and idle to idle is no recording ending.
  expect(dictationEndedByInterruption("idle", "idle", { status: "unlocked", appState: "background" }, covering)).toBeNull();
  expect(dictationEndedByInterruption("recording", "transcribing", { status: "unlocked", appState: "background" }, covering)).toBeNull();
});

// Whisper returns "" for speech it could not decode; the recording used to end with no text and no reason.
it("reports a recording that produced no words instead of ending silently", () => {
  expect(recognizedDictation("  Testleri çalıştır. ")).toBe("Testleri çalıştır.");
  expect(() => recognizedDictation("")).toThrow("Speech could not be recognized. Try again.");
  expect(() => recognizedDictation(" 	 ")).toThrow("Speech could not be recognized. Try again.");
});
