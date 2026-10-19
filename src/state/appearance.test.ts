import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { APPEARANCE_STORAGE_KEY, createAppearanceStore } from "./appearance";

function storage() {
  return {
    getItem: vi.fn(async (_key: string): Promise<string | null> => null),
    setItem: vi.fn(async (_key: string, _value: string) => {}),
  };
}

describe("appearance preference", () => {
  it.each(["system", "light", "dark"] as const)("restores %s with one read", async (themeMode) => {
    const adapter = storage();
    adapter.getItem.mockResolvedValueOnce(JSON.stringify({ version: 1, themeMode }));
    const store = createAppearanceStore(adapter);
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    expect(adapter.getItem).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ themeMode, hydrated: true, storageError: null });
  });

  it.each(["broken", "null", "[]", '{"themeMode":"unknown"}'])("uses the system for invalid storage: %s", async (raw) => {
    const adapter = storage();
    adapter.getItem.mockResolvedValueOnce(raw);
    const store = createAppearanceStore(adapter);
    await store.getState().hydrate();
    expect(store.getState().themeMode).toBe("system");
  });

  it("keeps a new selection when older storage finishes loading", async () => {
    const adapter = storage();
    let finish!: (value: string) => void;
    adapter.getItem.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const store = createAppearanceStore(adapter);
    const loading = store.getState().hydrate();
    await Promise.resolve();
    const saving = store.getState().setThemeMode("light");
    finish('{"themeMode":"dark"}');
    await Promise.all([loading, saving]);
    expect(store.getState().themeMode).toBe("light");
    expect(adapter.setItem).toHaveBeenLastCalledWith(APPEARANCE_STORAGE_KEY, '{"version":1,"themeMode":"light"}');
  });

  it("keeps rapid writes ordered and reports storage failure without losing selection", async () => {
    const adapter = storage();
    const store = createAppearanceStore(adapter);
    await store.getState().hydrate();
    adapter.setItem.mockRejectedValueOnce(new Error("Unavailable"));
    await store.getState().setThemeMode("dark");
    expect(store.getState()).toMatchObject({ themeMode: "dark", storageError: expect.any(Error) });
    await Promise.all([store.getState().setThemeMode("light"), store.getState().setThemeMode("system")]);
    expect(store.getState()).toMatchObject({ themeMode: "system", storageError: null });
    expect(adapter.setItem).toHaveBeenLastCalledWith(APPEARANCE_STORAGE_KEY, '{"version":1,"themeMode":"system"}');
  });

  it("keeps the application usable when preferences cannot be read", async () => {
    const adapter = storage();
    adapter.getItem.mockRejectedValueOnce(new Error("Unavailable"));
    const store = createAppearanceStore(adapter);
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ themeMode: "system", hydrated: true, storageError: expect.any(Error) });
  });
});
