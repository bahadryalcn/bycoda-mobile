import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { createProjectDirectoryPreferenceStore, normalizeProjectDirectoryPreferences } from "./project-directory-preferences";

describe("phone project directory preferences", () => {
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
});
