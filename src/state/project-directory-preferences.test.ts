import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { createProjectDirectoryPreferenceStore, normalizeProjectDirectoryPreferences } from "./project-directory-preferences";

describe("phone project directory preferences", () => {
  it("refuses writes after failed reads and merges recovered history before a later update", async () => {
    const saved = {a: {view: "list", sort: "name", fullPaths: true, collapsed: {work: true}, recent: {old: 12}}, b: {view: "list", sort: "recent"}};
    const storage = {
      getItem: vi.fn().mockRejectedValueOnce(new Error("read failed")).mockRejectedValueOnce(new Error("still unavailable")).mockResolvedValue(JSON.stringify(saved)),
      setItem: vi.fn().mockResolvedValue(undefined),
    };
    const store = createProjectDirectoryPreferenceStore(storage);
    await store.getState().hydrate();
    expect(store.getState().error).toBe(true);
    await store.getState().update("a", {sort: "desktop"});
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getState().error).toBe(true);
    await store.getState().update("a", (current) => ({recent: {...current.recent, new: 42}}));
    expect(storage.getItem).toHaveBeenCalledTimes(3);
    expect(store.getState().machines.a).toMatchObject({...saved.a, recent: {old: 12, new: 42}});
    expect(store.getState().machines.b).toMatchObject(saved.b);
    expect(store.getState().error).toBe(false);
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toMatchObject({a: {...saved.a, recent: {old: 12, new: 42}}, b: saved.b});
  });
  it("hydrates before merging a change and preserves each computer's choices", async () => {
    const saved = { a: { view: "list", sort: "name", fullPaths: true, collapsed: { work: true }, recent: { p: 12 } }, b: { view: "grouped", sort: "desktop" } };
    const storage = { getItem: vi.fn().mockResolvedValue(JSON.stringify(saved)), setItem: vi.fn().mockResolvedValue(undefined) };
    const store = createProjectDirectoryPreferenceStore(storage);
    await store.getState().update("a", { sort: "recent" });
    expect(store.getState().machines.a).toMatchObject({ view: "list", sort: "recent", fullPaths: true, collapsed: { work: true }, recent: { p: 12 } });
    expect(store.getState().machines.b?.sort).toBe("desktop");
    expect(JSON.parse(storage.setItem.mock.calls[0]![1]).a.sort).toBe("recent");
  });
  it("normalizes corrupt values and bounds local recent history", () => {
    const value = normalizeProjectDirectoryPreferences({ view: "broken", sort: "broken", collapsed: { a: true, b: "false" }, recent: { ...Object.fromEntries(Array.from({ length: 80 }, (_, i) => [String(i), i + 1])), bad: -1 } });
    expect(value.view).toBe("grouped");
    expect(value.sort).toBe("desktop");
    expect(value.collapsed).toEqual({ a: true });
    expect(Object.keys(value.recent)).toHaveLength(50);
    expect(value.recent.bad).toBeUndefined();
  });
  it("keeps the in-memory choice and reports a failed local save", async () => {
    const store = createProjectDirectoryPreferenceStore({ getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockRejectedValue(new Error("disk")) });
    await store.getState().update("a", { view: "list" });
    expect(store.getState().machines.a?.view).toBe("list");
    expect(store.getState().error).toBe(true);
  });
  it("migrates the retired custom drag order to the computer order and drops the stored order", async () => {
    const saved = { a: { view: "list", sort: "custom", order: { groups: ["g"], projects: { g: ["p"] }, flat: ["p"] } } };
    expect(normalizeProjectDirectoryPreferences(saved.a)).not.toHaveProperty("order");
    expect(normalizeProjectDirectoryPreferences(saved.a).sort).toBe("desktop");
    const storage = { getItem: vi.fn().mockResolvedValue(JSON.stringify(saved)), setItem: vi.fn().mockResolvedValue(undefined) };
    const store = createProjectDirectoryPreferenceStore(storage);
    await store.getState().update("a", { fullPaths: true });
    const written = JSON.parse(storage.setItem.mock.calls[0]![1]).a;
    expect(written).toMatchObject({ view: "list", sort: "desktop", fullPaths: true });
    expect(written).not.toHaveProperty("order");
  });
});
