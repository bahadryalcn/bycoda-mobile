import { describe, expect, it, vi } from "vitest";
import { deleteSavedDrafts, disconnectSavedComputers } from "./local-data";

describe("mobile local data controls", () => {
  it("only deletes known saved drafts, preserving credentials, settings, consent and other SDK data", async () => {
    const storage = {
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
    expect(await deleteSavedDrafts(storage, () => false)).toBe(4);
    expect(storage.multiRemove).toHaveBeenCalledExactlyOnceWith([
      "bycoda.mobile.draft.v1:a:s",
      'bycoda.mobile.file-draft.v1:["a"]',
      'bycoda.mobile.git-draft.v1:["a","project","cwd"]',
      "bycoda.mobile.note-draft.a",
    ]);
  });
  it("keeps deletion closed while computers are connected or storage cannot be read", async () => {
    const storage = {
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
      ids: () => ["a", "b", "c"],
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
