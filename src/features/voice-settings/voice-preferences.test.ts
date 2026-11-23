import { expect, it } from "vitest";
import { createVoicePreferenceStore, normalizeVoicePreferences, speechConfig } from "./voice-preferences";

// The phone always asked for the default voice; the owner could not pick one as on the desktop.
it("keeps the chosen assistant voice and sends it the way the desktop does", () => {
  expect(normalizeVoicePreferences({})).toMatchObject({ speech: "supertonic", speaker: "M1" });
  expect(normalizeVoicePreferences({ speech: "robot", speaker: "Z9" })).toMatchObject({ speech: "supertonic", speaker: "M1" });
  expect(normalizeVoicePreferences({ speech: "voxcpm2", speaker: "F3" })).toMatchObject({ speech: "voxcpm2", speaker: "F3" });
  // Defaults are omitted, like the desktop's voiceRuntimeSettings, so both share one Host runtime.
  expect(speechConfig({ speech: "supertonic", speaker: "M1" })).toEqual({ natural: true });
  expect(speechConfig({ speech: "supertonic", speaker: "F2" })).toEqual({ natural: true, voiceId: "F2" });
  expect(speechConfig({ speech: "voxcpm2", speaker: "F2" })).toEqual({ natural: true, engine: "voxcpm2" });
  expect(speechConfig({ speech: "elevenlabs", speaker: "M1" })).toEqual({ natural: true, engine: "elevenlabs" });
});

const key = "bycoda.mobile.voice-preferences.v1";

function fakeStorage(fault: { read?: boolean; write?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    fault,
    getItem: async (name: string) => {
      if (fault.read) throw new Error("read failed");
      return data.get(name) ?? null;
    },
    setItem: async (name: string, value: string) => {
      if (fault.write) throw new Error("write failed");
      data.set(name, value);
    },
  };
}

it("keeps a cloud engine choice visible and reports the failed save until a retry writes it", async () => {
  const storage = fakeStorage({ write: true });
  const store = createVoicePreferenceStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ engine: "cloud" });
  expect(store.getState().preferences.engine).toBe("cloud");
  expect(store.getState().storageError?.operation).toBe("save");
  expect(storage.data.has(key)).toBe(false);
  storage.fault.write = false;
  await store.getState().retry();
  expect(store.getState().storageError).toBeNull();
  expect(JSON.parse(storage.data.get(key)!).engine).toBe("cloud");
});

it("holds a microphone order changed while the stored record is unreadable and saves it after a successful retry", async () => {
  const storage = fakeStorage({ read: true });
  const store = createVoicePreferenceStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ micOrder: ["carplay", "wired", "bluetooth", "builtin"] });
  expect(store.getState().storageError?.operation).toBe("read");
  expect(store.getState().preferences.micOrder[0]).toBe("carplay");
  storage.fault.read = false;
  await store.getState().retry();
  expect(store.getState().preferences.micOrder[0]).toBe("carplay");
  expect(JSON.parse(storage.data.get(key)!).micOrder[0]).toBe("carplay");
});
