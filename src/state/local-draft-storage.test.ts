import { expect, it, vi } from "vitest";
import { createDraftStorageOwner, draftEpoch, subscribeDraftEpoch, withDraftStorageCleanup } from "./local-draft-storage";
const key = "bycoda.mobile.draft.v1:machine:session";
it("drains work already in progress and refuses older owners queued behind cleanup", async () => {
  const storage = {}; const owner = createDraftStorageOwner(storage, key); const events: string[] = [];
  let release!: () => void, began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const writing = owner.run(async () => { events.push("write"); began(); await new Promise<void>(resolve => { release = resolve; }); events.push("stored"); });
  await started;
  const cleanup = withDraftStorageCleanup(storage, async retire => { events.push("cleanup"); retire(new Set()); });
  const late = owner.run(async () => { events.push("resurrected"); }).catch(error => error as Error);
  expect(events).toEqual(["write"]); release(); await writing; await cleanup;
  expect(String(await late)).toContain("saved draft was cleared"); expect(events).toEqual(["write", "stored", "cleanup"]);
  await createDraftStorageOwner(storage, key).run(async () => { events.push("fresh"); }); expect(events.at(-1)).toBe("fresh");
});
it("keeps protected recovery keys and unrelated operation owners valid, retiring even empty draft owners", async () => {
  const storage = {}, protectedKey = key + "-pending", receiptKey = "bycoda.accountMetadata.v1:computer";
  const ordinary = createDraftStorageOwner(storage, key), protectedOwner = createDraftStorageOwner(storage, protectedKey), receipt = createDraftStorageOwner(storage, receiptKey);
  const changed = vi.fn(), kept = vi.fn(); const stop = subscribeDraftEpoch(storage, key, changed), stopKept = subscribeDraftEpoch(storage, protectedKey, kept);
  await withDraftStorageCleanup(storage, async retire => retire(new Set([protectedKey])));
  expect(ordinary.current()).toBe(false); expect(protectedOwner.current()).toBe(true); expect(receipt.current()).toBe(true); expect(changed).toHaveBeenCalledOnce(); expect(kept).not.toHaveBeenCalled();
  expect(draftEpoch(storage, key)).toBeGreaterThan(draftEpoch(storage, protectedKey)); stop(); stopKept();
});
it("blocks synchronous staging during cleanup and releases the barrier even after failure", async () => {
  const storage = {}, owner = createDraftStorageOwner(storage, key); let release!: () => void, began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const cleanup = withDraftStorageCleanup(storage, async retire => { began(); await new Promise<void>(resolve => { release = resolve; }); retire(new Set()); throw new Error("delete failed"); }).catch(error => error as Error);
  await started; expect(() => owner.runSync(() => "file")).toThrow("being cleared"); release(); expect(String(await cleanup)).toContain("delete failed");
  expect(() => owner.runSync(() => "old file")).toThrow("saved draft was cleared"); await expect(createDraftStorageOwner(storage, key).run(async () => "fresh")).resolves.toBe("fresh");
});
it("serializes successive cleanups without consuming later protected writes", async () => {
  const storage = {}; const events: string[] = [];
  await withDraftStorageCleanup(storage, async retire => { events.push("first"); retire(new Set([key])); });
  const writer = createDraftStorageOwner(storage, key).run(async () => { events.push("saved"); });
  const cleanup = withDraftStorageCleanup(storage, async retire => { events.push("second"); retire(new Set([key])); });
  await Promise.all([writer, cleanup]); expect(events).toEqual(["first", "saved", "second"]);
});
