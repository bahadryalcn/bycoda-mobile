import { expect, it } from "vitest";
import { micKind, pickMicInput } from "./mic-input";
import { moveMic, normalizeMicOrder, normalizeVoicePreferences } from "./voice-preferences";

const inputs = [
  { name: "iPhone Microphone", type: "MicrophoneBuiltIn", uid: "b" },
  { name: "AirPods", type: "BluetoothHFP", uid: "bt" },
];
it("classifies inputs", () => {
  expect(micKind(inputs[0]!)).toBe("builtin");
  expect(micKind(inputs[1]!)).toBe("bluetooth");
  expect(micKind({ name: "Car", type: "CarAudio" })).toBe("carplay");
  expect(micKind({ name: "x", type: "y" })).toBeUndefined();
});
it("picks the highest priority available input", () => {
  expect(pickMicInput(["wired", "bluetooth", "builtin", "carplay"], inputs)?.uid).toBe("bt");
  expect(pickMicInput(["wired", "carplay"], inputs)).toBeUndefined();
});
it("normalizes preferences and order", () => {
  expect(normalizeMicOrder(["builtin", "x", "builtin"])).toEqual(["builtin", "wired", "bluetooth", "carplay"]);
  expect(normalizeVoicePreferences({ engine: "cloud" }).engine).toBe("cloud");
  expect(normalizeVoicePreferences({ engine: "x" }).engine).toBe("local");
  expect(moveMic(["wired", "bluetooth"], "wired", 1)).toEqual(["bluetooth", "wired"]);
  expect(moveMic(["wired", "bluetooth"], "wired", -1)).toEqual(["wired", "bluetooth"]);
});
import { applyAndroidMicPriority, applyMicPriority } from "./mic-input";
it("applies the Android preferred input, or clears it, and ignores failures", () => {
  const set: (string | null)[] = [];
  const native = { listInputs: () => inputs, setPreferredInput: (uid: string | null) => { set.push(uid); } };
  expect(applyAndroidMicPriority(["bluetooth", "builtin"], native)?.uid).toBe("bt");
  expect(applyAndroidMicPriority(["wired"], native)).toBeUndefined();
  expect(set).toEqual(["bt", null]);
  expect(applyAndroidMicPriority(["builtin"], { listInputs: () => { throw new Error("x"); }, setPreferredInput: () => {} })).toBeUndefined();
  expect(applyAndroidMicPriority(["builtin"], {})).toBeUndefined();
});
it("applies the preferred input and tolerates failures", async () => {
  const chosen: string[] = [];
  const recorder = { prepareToRecordAsync: async () => {}, getAvailableInputs: () => inputs, setInput: (uid: string) => { chosen.push(uid); }, release: () => {} };
  expect((await applyMicPriority(["builtin", "bluetooth"], () => recorder))?.uid).toBe("b");
  expect(chosen).toEqual(["b"]);
  expect(await applyMicPriority(["wired"], () => { throw new Error("x"); })).toBeUndefined();
});
