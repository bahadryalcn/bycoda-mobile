import { expect, it } from "vitest";
import { connectedMicKinds, micKind, pickMicInput, readMicInputs, reorderConnectedMics } from "./mic-input";
import { normalizeMicOrder, normalizeVoicePreferences } from "./voice-preferences";

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
it("shows only connected microphone kinds and trusts the native route type", () => {
  const order = normalizeMicOrder([]);
  const builtIn = { name: "Galaxy", type: "builtin", uid: "1" };
  expect(connectedMicKinds(order, [builtIn, { ...builtIn, uid: "2" }])).toEqual(["builtin"]);
  expect(connectedMicKinds(order, [])).toEqual([]);
  expect(micKind({ name: "phone", type: "other" })).toBeUndefined();
  expect(readMicInputs({ listInputs() { throw new Error("Device list unavailable"); } })).toEqual([]);
});
it("drags connected inputs past each other without moving the saved unplugged slots", () => {
  const order = normalizeMicOrder(["bluetooth", "carplay", "builtin", "wired"]);
  const visible = connectedMicKinds(order, inputs);
  expect(visible).toEqual(["bluetooth", "builtin"]);
  expect(reorderConnectedMics(order, visible, "builtin", 0)).toEqual(["builtin", "carplay", "bluetooth", "wired"]);
  expect(reorderConnectedMics(order, visible, "wired", 0)).toBe(order);
});
it("normalizes preferences and order", () => {
  expect(normalizeMicOrder(["builtin", "x", "builtin"])).toEqual(["builtin", "wired", "bluetooth", "carplay"]);
  expect(normalizeVoicePreferences({ engine: "cloud" }).engine).toBe("cloud");
  expect(normalizeVoicePreferences({ engine: "x" }).engine).toBe("local");
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
