import { expect, it, vi } from "vitest";
import { historyPendingStore } from "./history-import-pending";
it("persists exactly one operation claim before sending and clears only its own receipt", async () => {
  let raw: string | null = null;
  const storage = {
    getItem: vi.fn(async () => raw),
    setItem: vi.fn(async (_key: string, value: string) => {
      raw = value;
    }),
    removeItem: vi.fn(async () => {
      raw = null;
    }),
  };
  const store = historyPendingStore(storage, "key");
  const one = { operationId: "one", digest: "a".repeat(64), environmentId: "env" };
  const [a, b] = await Promise.all([store.claim(one), store.claim({ ...one, operationId: "two" })]);
  expect([a.claimed, b.claimed]).toEqual([true, false]);
  expect(b.attempt.operationId).toBe("one");
  await store.clear("two");
  expect((await store.load())?.operationId).toBe("one");
  expect(Object.keys(JSON.parse(raw!)).sort()).toEqual(["digest", "environmentId", "operationId"]);
  await store.clear("one");
  expect(await store.load()).toBeNull();
});
it("corrupt or failed storage refuses a new claim without forgetting unknown delivery", async () => {
  const missingId = historyPendingStore({ getItem: async () => JSON.stringify({ environmentId: "env", digest: "a".repeat(64) }), setItem: vi.fn(), removeItem: vi.fn() }, "missing-id");
  await expect(missingId.load()).rejects.toThrow("Invalid saved history receipt");
  const storage = { getItem: async () => "bad json", setItem: vi.fn(), removeItem: vi.fn() };
  const store = historyPendingStore(storage, "corrupt");
  await expect(
    store.claim({ operationId: "one", digest: "a".repeat(64), environmentId: "env" }),
  ).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
