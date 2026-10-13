import { describe, expect, it, vi } from "vitest";
import { consentKey, consentScope, consentVersion, createConsentStore } from "./consent-store";

function fixture(raw: string | null = null) {
  let saved = raw;
  const storage = {
    getItem: vi.fn(async () => saved),
    setItem: vi.fn(async (_key: string, value: string) => {
      saved = value;
    }),
    removeItem: vi.fn(async () => {
      saved = null;
    }),
  };
  return { storage, store: createConsentStore(storage) };
}

describe("explicit provider consent", () => {
  it("does not grant consent on first use, an old disclosure or another computer/provider set", async () => {
    const scope = consentScope("computer-a", ["claude", "codex"]);
    const { store } = fixture();
    expect(await store.allows(scope)).toBe(false);
    await store.allow(scope);
    expect(await store.allows(consentScope("computer-a", ["codex", "claude", "codex"]))).toBe(true);
    expect(await store.allows(consentScope("computer-b", ["codex", "claude"]))).toBe(false);
    expect(await store.allows(consentScope("computer-a", ["codex", "gemini"]))).toBe(false);
    expect(
      await fixture(JSON.stringify({ version: "old", scopes: [scope] })).store.allows(scope),
    ).toBe(false);
  });
  it("retains both computers during simultaneous permissions and revokes all saved permissions", async () => {
    const { store, storage } = fixture();
    await Promise.all([store.allow("a"), store.allow("b")]);
    expect(await store.allows("a")).toBe(true);
    expect(await store.allows("b")).toBe(true);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      consentKey,
      JSON.stringify({ version: consentVersion, scopes: ["a", "b"] }),
    );
    await store.revoke();
    expect(await store.allows("a")).toBe(false);
  });
  it("fails closed without overwriting unread or corrupt preferences", async () => {
    const { store, storage } = fixture("{broken");
    await expect(store.allows("a")).rejects.toThrow();
    await expect(store.allow("a")).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    const valid = fixture();
    valid.storage.getItem.mockRejectedValueOnce(new Error("storage"));
    await expect(valid.store.allow("a")).rejects.toThrow("storage");
    expect(valid.storage.setItem).not.toHaveBeenCalled();
    valid.storage.setItem.mockRejectedValueOnce(new Error("full"));
    await expect(valid.store.allow("a")).rejects.toThrow("full");
    expect(await valid.store.allows("a")).toBe(false);
  });
});
