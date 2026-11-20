import { expect, it, vi } from "vitest";
import { draftPresence, hydrateDraftPresence, publishDraftPresence, subscribeDraftPresence, subscribeDraftPresenceChanges, withDraftStorageCleanup } from "./local-draft-storage";
import { DraftStore } from "../features/workspace/draft-store";

it("hydrates once, isolates machine keys and publishes successful saves and clear", async () => {
  const storage = { getItem: vi.fn().mockResolvedValue("persisted"), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn().mockResolvedValue(undefined) };
  const key = "bycoda.mobile.draft.v1:m:s";
  const listener = vi.fn(); subscribeDraftPresence(storage, key, listener);
  await Promise.all([hydrateDraftPresence(storage, key, Boolean), hydrateDraftPresence(storage, key, Boolean)]);
  await hydrateDraftPresence(storage, key, Boolean);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(draftPresence(storage, key)).toBe(true);
  expect(draftPresence(storage, "bycoda.mobile.draft.v1:other:s")).toBe(false);
  const store = new DraftStore(storage, key, raw => raw, value => value);
  await store.load(); await store.persist(null);
  expect(draftPresence(storage, key)).toBe(false);
  storage.setItem.mockRejectedValueOnce(new Error("disk"));
  await expect(store.persist("unsaved")).rejects.toThrow("disk");
  expect(draftPresence(storage, key)).toBe(false);
  await store.persist("saved"); expect(draftPresence(storage, key)).toBe(true);
  await withDraftStorageCleanup(storage, async retire => { retire(new Set()); });
  expect(draftPresence(storage, key)).toBe(false);
  expect(store.retired).toBe(true);
  expect(listener).toHaveBeenCalled();
});
it("cleanup drains hydration before removing presence", async () => {
  let release!: (value: string) => void;
  const storage = { getItem: () => new Promise<string>(resolve => { release = resolve; }) };
  const key = "bycoda.mobile.draft.v1:m:s";
  const read = hydrateDraftPresence(storage, key, Boolean);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const cleanup = withDraftStorageCleanup(storage, async retire => retire(new Set()));
  release("attachment-only"); await read; await cleanup;
  expect(draftPresence(storage, key)).toBe(false);
});

it("announces only presence flips and finished cleanups to storage-wide observers", async () => {
  const storage = {}; const key = "bycoda.mobile.draft.v1:m:s";
  const seen: Array<string | null> = []; const stop = subscribeDraftPresenceChanges(storage, changed => { seen.push(changed); });
  publishDraftPresence(storage, key, false); publishDraftPresence(storage, key, true); publishDraftPresence(storage, key, true);
  expect(seen).toEqual([key]);
  await withDraftStorageCleanup(storage, async retire => { retire(new Set()); });
  expect(seen).toEqual([key, key, null]);
  stop(); publishDraftPresence(storage, key, true);
  expect(seen).toHaveLength(3);
});
