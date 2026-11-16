import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { createAppearanceStore } from "./appearance";
import { DEFAULT_TYPOGRAPHY } from "../ui/typography-preferences";

describe("saved general typography", () => {
  it("retries a failed read without overwriting saved values and ignores stale recovery", async () => {
    const storage = { getItem: vi.fn(async () => JSON.stringify({ themeMode: "dark", palette: "tide", typography: { scale: 1.2 } })), setItem: vi.fn(async (_key: string, _value: string) => {}) };
    storage.getItem.mockRejectedValueOnce(new Error("locked"));
    const store = createAppearanceStore(storage);
    await store.getState().hydrate();
    const error = store.getState().storageError!;
    await store.getState().retryStorage(error);
    expect(store.getState()).toMatchObject({ themeMode: "dark", palette: "tide", typography: { scale: 1.2 }, storageError: null });
    expect(storage.setItem).not.toHaveBeenCalled();
    await store.getState().setTypography({ scale: 1.1 });
    await store.getState().retryStorage(error);
    expect(store.getState().typography.scale).toBe(1.1);
    expect(storage.getItem).toHaveBeenCalledTimes(2);
  });
  it("migrates theme-only records and keeps other preferences on text reset", async () => {
    const storage = { getItem: vi.fn(async () => '{"themeMode":"light","palette":"tide"}'), setItem: vi.fn(async (_key: string, _value: string) => {}) };
    const store = createAppearanceStore(storage);
    await store.getState().hydrate();
    expect(store.getState().typography).toEqual(DEFAULT_TYPOGRAPHY);
    await store.getState().setTypography({ scale: 1.2, fontFamily: "serif" });
    await store.getState().setTypography({ weight: "bold" });
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]!)).toMatchObject({
      themeMode: "light", palette: "tide", typography: { scale: 1.2, fontFamily: "serif", weight: "bold" },
    });
    await store.getState().resetTypography();
    expect(store.getState()).toMatchObject({ themeMode: "light", palette: "tide", typography: DEFAULT_TYPOGRAPHY });
  });
  it("retains failed-save text intent and persists it on retry", async () => {
    const storage = { getItem: vi.fn(async () => null), setItem: vi.fn(async (_key: string, _value: string) => {}) };
    const store = createAppearanceStore(storage);
    await store.getState().hydrate();
    storage.setItem.mockRejectedValueOnce(new Error("disk"));
    await store.getState().setTypography({ fontFamily: "mono", scale: 1.15 });
    expect(store.getState()).toMatchObject({ typography: { fontFamily: "mono", scale: 1.15 }, storageError: expect.any(Error) });
    await store.getState().setTypography({});
    expect(store.getState().storageError).toBeNull();
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]!)).toMatchObject({ typography: { fontFamily: "mono", scale: 1.15 } });
  });
});
