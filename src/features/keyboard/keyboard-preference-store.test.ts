import { describe, expect, it, vi } from "vitest";
import { createKeyboardPreferences, KEYBOARD_STORAGE_KEY } from "./keyboard-preference-store";

describe("hardware keyboard preference", () => {
  it("defaults on and restores explicit false", async () => {
    const store = createKeyboardPreferences({ getItem: async () => '{"enterSends":false}', setItem: vi.fn() });
    expect(store.getState().enterSends).toBe(true);
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    expect(store.getState()).toMatchObject({ enterSends: false, hydrated: true });
  });
  it("validates stored values and reports malformed/read failures", async () => {
    const store = createKeyboardPreferences({ getItem: async () => '{"enterSends":"false"}', setItem: vi.fn() });
    await store.getState().hydrate();
    expect(store.getState().enterSends).toBe(true);
    const broken = createKeyboardPreferences({ getItem: async () => "broken", setItem: vi.fn() });
    await broken.getState().hydrate();
    expect(broken.getState().error?.message).toContain("loaded");
  });
  it("keeps a newer selection when an older read resolves", async () => {
    let resolve!: (value: string) => void;
    const write = vi.fn(async () => {});
    const store = createKeyboardPreferences({ getItem: () => new Promise((done) => { resolve = done; }), setItem: write });
    const hydration = store.getState().hydrate();
    await store.getState().setEnterSends(false);
    resolve('{"enterSends":true}');
    await hydration;
    expect(store.getState().enterSends).toBe(false);
    expect(write).toHaveBeenCalledWith(KEYBOARD_STORAGE_KEY, '{"enterSends":false}');
  });
  it("serializes writes and recovers after a failed save", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
    const store = createKeyboardPreferences({ getItem: async () => null, setItem: write });
    await store.getState().setEnterSends(false);
    expect(store.getState().error?.message).toContain("saved");
    await store.getState().setEnterSends(true);
    expect(store.getState().error).toBe(null);
    expect(write.mock.calls.map((call) => call[1])).toEqual(['{"enterSends":false}', '{"enterSends":true}']);
  });
});
