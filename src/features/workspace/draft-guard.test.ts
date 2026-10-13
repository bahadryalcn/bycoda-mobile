import { describe, expect, it, vi } from "vitest";
import { flushWorkspaceDrafts, registerWorkspaceDraft } from "./draft-guard";

describe("drafts before switching computers", () => {
  it("awaits each registered editor in order before a machine may change", async () => {
    const order: string[] = [];
    let release!: () => void;
    const cleanupA = registerWorkspaceDraft(
      "a",
      () =>
        new Promise<void>((resolve) => {
          order.push("a");
          release = resolve;
        }),
    );
    const cleanupB = registerWorkspaceDraft("b", async () => {
      order.push("b");
    });
    try {
      const flushing = flushWorkspaceDrafts();
      expect(order).toEqual(["a"]);
      release();
      await flushing;
      expect(order).toEqual(["a", "b"]);
    } finally {
      cleanupA();
      cleanupB();
    }
  });

  it("propagates storage failure without continuing navigation and allows a later retry", async () => {
    const first = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage full"))
      .mockResolvedValue(undefined);
    const next = vi.fn().mockResolvedValue(undefined);
    const cleanupA = registerWorkspaceDraft("failed", first);
    const cleanupB = registerWorkspaceDraft("next", next);
    try {
      await expect(flushWorkspaceDrafts()).rejects.toThrow("Storage full");
      expect(next).not.toHaveBeenCalled();
      await flushWorkspaceDrafts();
      expect(first).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      cleanupA();
      cleanupB();
    }
  });

  it("ignores cleanup from an older mounted editor after its draft registration is replaced", async () => {
    const old = vi.fn().mockResolvedValue(undefined);
    const current = vi.fn().mockResolvedValue(undefined);
    const cleanupOld = registerWorkspaceDraft("same-key", old);
    const cleanupCurrent = registerWorkspaceDraft("same-key", current);
    try {
      cleanupOld();
      await flushWorkspaceDrafts();
      expect(old).not.toHaveBeenCalled();
      expect(current).toHaveBeenCalledOnce();
    } finally {
      cleanupOld();
      cleanupCurrent();
    }
    await flushWorkspaceDrafts();
    expect(current).toHaveBeenCalledOnce();
  });
});
