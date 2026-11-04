import { describe, expect, it, vi } from "vitest";
import { deleteSavedDrafts, disconnectSavedComputers, matchesReviewedComputers } from "./local-data";

describe("mobile local data controls", () => {
  it("only deletes known saved drafts, preserving credentials, settings, consent and other SDK data", async () => {
    const storage = {
      getItem: vi.fn(async () => "stored draft"),
      getAllKeys: vi.fn(async () => [
        "bycoda.mobile.draft.v1:a:s",
        'bycoda.mobile.file-draft.v1:["a"]',
        'bycoda.mobile.git-draft.v1:["a","project","cwd"]',
        "bycoda.mobile.note-draft.a",
        "bycoda.mobile.remote-machines.v1",
        "bycoda.mobile.provider-consent.v1",
        "bycoda.mobile.future-data",
        "sdk.setting",
      ]),
      multiRemove: vi.fn(async () => undefined),
    };
    expect(await deleteSavedDrafts(storage, () => false)).toEqual({ removed: 4, retained: 0 });
    expect(storage.multiRemove).toHaveBeenCalledExactlyOnceWith([
      "bycoda.mobile.draft.v1:a:s",
      'bycoda.mobile.file-draft.v1:["a"]',
      'bycoda.mobile.git-draft.v1:["a","project","cwd"]',
      "bycoda.mobile.note-draft.a",
    ]);
  });
  it("keeps deletion closed while computers are connected or storage cannot be read", async () => {
    const storage = {
      getItem: vi.fn(async () => "stored draft"),
      getAllKeys: vi.fn(async () => ["bycoda.mobile.draft.v1:a"]),
      multiRemove: vi.fn(async () => undefined),
    };
    await expect(deleteSavedDrafts(storage, () => true)).rejects.toThrow("Disconnect");
    expect(storage.getAllKeys).not.toHaveBeenCalled();
    storage.getAllKeys.mockRejectedValueOnce(new Error("unavailable"));
    await expect(deleteSavedDrafts(storage, () => false)).rejects.toThrow("unavailable");
    expect(storage.multiRemove).not.toHaveBeenCalled();
    let connected = false;
    storage.getAllKeys.mockImplementationOnce(async () => {
      connected = true;
      return [];
    });
    await expect(deleteSavedDrafts(storage, () => connected)).rejects.toThrow("Disconnect");
    expect(storage.multiRemove).not.toHaveBeenCalled();
  });
  it("does not claim success when deleting drafts fails", async () => {
    await expect(
      deleteSavedDrafts(
        {
          getItem: vi.fn(async () => "stored draft"),
      getAllKeys: async () => ["bycoda.mobile.draft.v1:a"],
          multiRemove: async () => {
            throw new Error("delete failed");
          },
        },
        () => false,
      ),
    ).rejects.toThrow("delete failed");
  });
  it("flushes drafts and cancels requests before forgetting keys; stops on a failed removal", async () => {
    const order: string[] = [];
    const actions = {
      ready: () => true,
      reviewed: ["a", "b", "c"].map(id => ({ id, endpoint: "https://" + id + ".example", environmentId: id })),
      current: () => ["a", "b", "c"].map(id => ({ id, endpoint: "https://" + id + ".example", environmentId: id })),
      flush: async () => {
        order.push("flush");
      },
      cancelQueries: async () => {
        order.push("cancel");
      },
      remove: async (id: string) => {
        order.push(id);
        if (id === "b") throw new Error("secure storage failed");
      },
    };
    await expect(disconnectSavedComputers(actions)).rejects.toThrow("secure storage failed");
    expect(order).toEqual(["flush", "cancel", "a", "b"]);
    order.length = 0;
    await expect(disconnectSavedComputers({ ...actions, ready: () => false })).rejects.toThrow(
      "Reload",
    );
    expect(order).toEqual([]);
    await expect(
      disconnectSavedComputers({
        ...actions,
        flush: async () => {
          throw new Error("draft unread");
        },
      }),
    ).rejects.toThrow("draft unread");
    expect(order).toEqual([]);
  });
});

const original = { id: "a", endpoint: "https://original.example", environmentId: "host", lanKey: "original-key" };
it("rejects expanded or replaced computer scopes while accepting already removed reviewed entries", () => {
  expect(matchesReviewedComputers([original], [])).toBe(true);
  expect(matchesReviewedComputers([original], [{ ...original, name: "Renamed" } as typeof original])).toBe(true);
  for (const current of [[original, { ...original, id: "new" }], [{ ...original, endpoint: "https://replacement.example" }], [{ ...original, environmentId: "new" }], [{ ...original, lanKey: "new" }]]) expect(matchesReviewedComputers([original], current)).toBe(false);
});
it.each(["flush", "cancelQueries"] as const)("does not widen removal after computers change during %s", async step => {
  let machines = [original]; const remove = vi.fn(async () => {});
  const changed = async () => { machines = [original, { ...original, id: "new" }]; };
  await expect(disconnectSavedComputers({ ready: () => true, reviewed: [original], current: () => machines,
    flush: step === "flush" ? changed : async () => {}, cancelQueries: step === "cancelQueries" ? changed : async () => {}, remove })).rejects.toThrow("Saved computers changed");
  expect(remove).not.toHaveBeenCalled();
});
it("passes frozen identities and stops the remaining removal after an unreviewed computer appears", async () => {
  const second = { ...original, id: "b" }; let machines = [original, second]; const calls: unknown[] = [];
  await expect(disconnectSavedComputers({ ready: () => true, reviewed: [original, second], current: () => machines, flush: async () => {}, cancelQueries: async () => {},
    remove: async (id, expected) => { calls.push({ id, expected }); machines = [second, { ...original, id: "new" }]; } })).rejects.toThrow("Saved computers changed");
  expect(calls).toEqual([{ id: "a", expected: original }]);
});
it("retries only the still-present reviewed identities after a partial secure-storage failure", async () => {
  const second = { ...original, id: "b" }; let machines = [original, second], fail = true; const removed: string[] = [];
  const actions = { ready: () => true, reviewed: [original, second], current: () => machines, flush: async () => {}, cancelQueries: async () => {}, remove: async (id: string) => {
    if (id === "b" && fail) throw new Error("keychain unavailable"); removed.push(id); machines = machines.filter(machine => machine.id !== id);
  } };
  await expect(disconnectSavedComputers(actions)).rejects.toThrow("keychain unavailable"); fail = false; await disconnectSavedComputers(actions); expect(removed).toEqual(["a", "b"]);
});

it("retains pending and unreadable composer recovery while deleting ordinary and queue-edit drafts", async () => {
  const pending = "bycoda.mobile.draft.v1:machine:pending", unreadable = "bycoda.mobile.draft.v1:machine:unreadable";
  const ordinary = "bycoda.mobile.draft.v1:machine:ordinary", queued = "bycoda.mobile.queue-edit.v1:machine:session";
  const data = new Map([[pending, 'bycoda-composer-v2:\n'+JSON.stringify({ version: 2, text: "pending send", attachments: [], selectedMentionRefs: [], queueIntent: { id: "operation", contentDigest: "a".repeat(64), authorityGeneration: 1 } })], [unreadable, 'bycoda-composer-v2:\n{broken'], [ordinary, "ordinary text"], [queued, "queued edit"], ["bycoda.accountMetadata.v1:receipt", "keep operation"], ["sdk.setting", "keep setting"]]);
  const cleanupFiles = vi.fn();
  const result = await deleteSavedDrafts({ getAllKeys: async () => [...data.keys()], getItem: async key => data.get(key) ?? null, multiRemove: async keys => { keys.forEach(key => data.delete(key)); } }, () => false, cleanupFiles);
  expect(result).toEqual({ removed: 2, retained: 2 }); expect([...data.keys()]).toEqual([pending, unreadable, "bycoda.accountMetadata.v1:receipt", "sdk.setting"]);
  expect(cleanupFiles).toHaveBeenCalledExactlyOnceWith(["machine:pending", "machine:unreadable"]);
});
it("does not clean physical attachment files when metadata deletion is uncertain", async () => {
  const cleanup = vi.fn();
  await expect(deleteSavedDrafts({ getAllKeys: async () => ["bycoda.mobile.draft.v1:machine:session"], getItem: async () => "ordinary", multiRemove: async () => { throw new Error("partial removal"); } }, () => false, cleanup)).rejects.toThrow("partial removal");
  expect(cleanup).not.toHaveBeenCalled();
});

it("keeps old writers retired and retries an attachment failure after metadata was deleted", async () => {
  const { DraftStore } = await import("../workspace/draft-store");
  const key = "bycoda.mobile.draft.v1:retry:session", values = new Map([[key, "ordinary draft"], ["sdk.setting", "keep"]]);
  const disk = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); }, getAllKeys: async () => [...values.keys()], multiRemove: async (keys: string[]) => { keys.forEach(key => values.delete(key)); } };
  const old = new DraftStore(disk, key, raw => raw, value => value); await old.load();
  const cleanup = vi.fn().mockRejectedValueOnce(new Error("file cleanup failed")).mockResolvedValueOnce(undefined);
  await expect(deleteSavedDrafts(disk, () => false, cleanup)).rejects.toThrow("file cleanup failed");
  await expect(old.persist("old unmount flush")).rejects.toThrow("saved draft was cleared"); expect(values.has(key)).toBe(false);
  await expect(deleteSavedDrafts(disk, () => false, cleanup)).resolves.toEqual({ removed: 0, retained: 0 }); expect(values.get("sdk.setting")).toBe("keep"); expect(cleanup).toHaveBeenCalledTimes(2);
});
