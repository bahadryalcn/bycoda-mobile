import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { reviewedMachineIdentityDigest, type ReviewedMachine } from "./reviewed-machine";
import { reviewedOperationStore } from "./reviewed-operation-store";
const hash = async (text: string) => createHash("sha256").update(text).digest("hex");
it("binds persisted identity to endpoint/environment/LAN key while returning only a digest", async () => {
  const machine: ReviewedMachine = {
    id: "machine",
    endpoint: "https://fixture",
    environmentId: "env",
    lanKey: "synthetic-key",
  };
  const digest = await reviewedMachineIdentityDigest(machine, hash);
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  expect(digest).not.toContain("fixture");
  for (const changed of [
    { ...machine, endpoint: "https://replacement" },
    { ...machine, environmentId: "replacement" },
    { ...machine, lanKey: "replacement" },
  ])
    expect(await reviewedMachineIdentityDigest(changed, hash)).not.toBe(digest);
  await expect(reviewedMachineIdentityDigest(machine, async () => "invalid")).rejects.toThrow();
});
it("serializes competing durable claims and preserves target digest without overwriting the first request", async () => {
  let value: string | null = null;
  const storage = {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => {
      value = next;
    },
    removeItem: async () => {
      value = null;
    },
  };
  const store = reviewedOperationStore(storage, "synthetic-receipt");
  const first = {
    operationId: "first",
    environmentId: "env",
    digest: "a".repeat(64),
    targetIdentityDigest: "b".repeat(64),
  };
  const results = await Promise.all([
    store.claim(first),
    store.claim({ ...first, operationId: "second" }),
  ]);
  expect(results.map((result) => result.claimed)).toEqual([true, false]);
  expect(await store.load()).toEqual(first);
  await store.clear("second");
  expect(await store.load()).toEqual(first);
  value = JSON.stringify({ ...first, targetIdentityDigest: "invalid" });
  await expect(store.load()).rejects.toThrow();
});
