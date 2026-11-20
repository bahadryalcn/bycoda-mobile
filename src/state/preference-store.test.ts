import { expect, it } from "vitest";
import { createPreferenceStore } from "./preference-store";

type Prefs = { on: boolean; order: string[] };
const key = "bycoda.test.preferences.v1";
const defaults: Prefs = { on: false, order: ["a"] };
const normalize = (value: unknown): Prefs => {
  const data = (value && typeof value === "object" ? value : {}) as Partial<Prefs>;
  return { on: data.on === true, order: Array.isArray(data.order) ? data.order.map(String) : defaults.order };
};

function fakeStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
  const fault = { read: false, write: false };
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

const createStore = (storage: ReturnType<typeof fakeStorage>) =>
  createPreferenceStore<Prefs>({ key, storage, defaults, normalize });

it("keeps a choice made while storage is unreadable and writes nothing over the stored record", async () => {
  const storage = fakeStorage(JSON.stringify({ on: false, order: ["x"] }));
  storage.fault.read = true;
  const store = createStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ on: true });
  expect(store.getState().preferences.on).toBe(true);
  expect(store.getState().storageError?.operation).toBe("read");
  expect(storage.data.get(key)).toBe(JSON.stringify({ on: false, order: ["x"] }));
});

it("applies a choice held during a failed read over the stored record once the retry reads it", async () => {
  const storage = fakeStorage(JSON.stringify({ on: false, order: ["x"] }));
  storage.fault.read = true;
  const store = createStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ on: true });
  storage.fault.read = false;
  await store.getState().retry();
  expect(store.getState().preferences).toEqual({ on: true, order: ["x"] });
  expect(store.getState().storageError).toBeNull();
  expect(JSON.parse(storage.data.get(key)!)).toEqual({ on: true, order: ["x"] });
});

it("reports a failed save, keeps the choice on screen and writes it on retry", async () => {
  const storage = fakeStorage();
  storage.fault.write = true;
  const store = createStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ on: true });
  expect(store.getState().preferences.on).toBe(true);
  expect(store.getState().storageError?.operation).toBe("save");
  expect(storage.data.has(key)).toBe(false);
  storage.fault.write = false;
  await store.getState().retry();
  expect(store.getState().storageError).toBeNull();
  expect(JSON.parse(storage.data.get(key)!)).toMatchObject({ on: true });
});

it("clears a save error when a later save succeeds", async () => {
  const storage = fakeStorage();
  storage.fault.write = true;
  const store = createStore(storage);
  await store.getState().hydrate();
  await store.getState().update({ on: true });
  storage.fault.write = false;
  await store.getState().update({ order: ["b"] });
  expect(store.getState().storageError).toBeNull();
  expect(JSON.parse(storage.data.get(key)!)).toEqual({ on: true, order: ["b"] });
});
