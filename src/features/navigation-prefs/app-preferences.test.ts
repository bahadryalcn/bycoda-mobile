import { expect, it } from "vitest";
import { createAppPreferenceStore, defaultAppPreferences, normalizeAppPreferences } from "./app-preferences";

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set("bycoda.mobile.app-preferences.v1", initial);
  return { data, getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, value: string) => { data.set(key, value); } };
}

it("normalizes invalid values to defaults", () => {
  expect(normalizeAppPreferences("x")).toEqual(defaultAppPreferences);
  expect(normalizeAppPreferences({ groupByRepository: "yes" }).groupByRepository).toBe(false);
});

it("hydrates, updates and persists", async () => {
  const storage = memory(JSON.stringify({ groupByRepository: true }));
  const store = createAppPreferenceStore(storage);
  await store.getState().hydrate();
  expect(store.getState().preferences.groupByRepository).toBe(true);
  await store.getState().update({ newSessionUsesLastProject: true });
  expect(JSON.parse(storage.data.get("bycoda.mobile.app-preferences.v1")!)).toMatchObject({ groupByRepository: true, newSessionUsesLastProject: true });
});

it("keeps a choice made while storage is unreadable, reports it and never writes over unknown values", async () => {
  const storage = { getItem: async () => { throw new Error("x"); }, setItem: async () => { throw new Error("must not write"); } };
  const store = createAppPreferenceStore(storage);
  await store.getState().update({ groupByRepository: true });
  expect(store.getState().preferences.groupByRepository).toBe(true);
  expect(store.getState().storageError?.operation).toBe("read");
});
