import { expect, it } from "vitest";
import {
  emptyInboxSeen,
  hasUnseenInboxItems,
  INBOX_SEEN_RETENTION_MS,
  markInboxItemsSeen,
} from "./inbox-seen-model";
import { createInboxSeenStore, INBOX_SEEN_KEY } from "./inbox-seen-store";

const now = 1_800_000_000_000;

it("shows nothing before the first sighting seeds the store", () => {
  expect(hasUnseenInboxItems(emptyInboxSeen, [{ id: "a", updatedAt: now }], now)).toBe(false);
});

it("flags a new recent item and a changed item, not an old unrecorded one", () => {
  const seeded = markInboxItemsSeen(emptyInboxSeen, [{ id: "a", updatedAt: now - 1000 }], now);
  expect(hasUnseenInboxItems(seeded, [{ id: "a", updatedAt: now - 1000 }], now)).toBe(false);
  expect(hasUnseenInboxItems(seeded, [{ id: "a", updatedAt: now }], now)).toBe(true);
  expect(hasUnseenInboxItems(seeded, [{ id: "b", updatedAt: now }], now)).toBe(true);
  expect(hasUnseenInboxItems(seeded, [{ id: "c", updatedAt: now - INBOX_SEEN_RETENTION_MS - 1 }], now)).toBe(false);
});

it("marking seen clears the flag and prunes expired records", () => {
  const old = { seeded: true, seen: { gone: now - INBOX_SEEN_RETENTION_MS - 5 } };
  const next = markInboxItemsSeen(old, [{ id: "a", updatedAt: now }], now);
  expect(next.seen).toEqual({ a: now });
  expect(hasUnseenInboxItems(next, [{ id: "a", updatedAt: now }], now)).toBe(false);
  expect(markInboxItemsSeen(next, [{ id: "a", updatedAt: now }], now)).toBe(next);
});

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[INBOX_SEEN_KEY, initial]] : []);
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => void data.set(key, value),
  };
}

it("seeds once per computer, persists, and does not reseed after hydration", async () => {
  const storage = memoryStorage();
  const store = createInboxSeenStore(storage);
  await store.getState().seedIfNeeded("m1", [{ id: "a", updatedAt: now }]);
  expect(store.getState().machines.m1?.seeded).toBe(true);
  await store.getState().seedIfNeeded("m1", [{ id: "b", updatedAt: now }]);
  expect(store.getState().machines.m1?.seen).toEqual({ a: now });
  const again = createInboxSeenStore(storage);
  await again.getState().seedIfNeeded("m1", [{ id: "c", updatedAt: now }]);
  expect(again.getState().machines.m1?.seen).toEqual({ a: now });
});

it("keeps an unreadable store unseeded instead of overwriting it", async () => {
  const storage = { getItem: async () => { throw new Error("denied"); }, setItem: async () => { throw new Error("no write"); } };
  const store = createInboxSeenStore(storage);
  await store.getState().markSeen("m1", [{ id: "a", updatedAt: now }]);
  expect(store.getState().machines.m1).toBeUndefined();
});
