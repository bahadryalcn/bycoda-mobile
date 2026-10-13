import { describe, expect, it, vi } from "vitest";
import { DraftStore, flushLatestDraft, parseFileDraft, retainDraftThenLeave } from "./draft-store";
import { RouteMachine } from "./route-machine";

describe("workspace draft protection", () => {
  it("flushes edits made during a slow storage write before navigation can finish", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const storage = {
      getItem: vi.fn().mockResolvedValue(null),
      removeItem: vi.fn(),
      setItem: vi
        .fn()
        .mockImplementationOnce(() => blocked)
        .mockResolvedValue(undefined),
    };
    const draft = new DraftStore<string>(
      storage,
      "machine:file",
      (raw) => raw,
      (value) => value,
    );
    await draft.load();
    let value = "first edit";
    const completed = vi.fn();
    const flush = flushLatestDraft(draft, () => value).then(completed);
    await Promise.resolve();
    value = "latest edit";
    expect(completed).not.toHaveBeenCalled();
    release();
    await flush;
    expect(storage.setItem).toHaveBeenNthCalledWith(1, "machine:file", "first edit");
    expect(storage.setItem).toHaveBeenLastCalledWith("machine:file", "latest edit");
    expect(completed).toHaveBeenCalledOnce();
  });
  it("never overwrites or removes an unread draft after a failed storage read", async () => {
    const storage = {
      getItem: vi.fn().mockRejectedValue(new Error("read failed")),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const draft = new DraftStore<string>(
      storage,
      "machine-a:session",
      (raw) => raw,
      (value) => value || null,
    );
    await expect(draft.load()).rejects.toThrow("read failed");
    expect(draft.ready).toBe(false);
    await expect(draft.persist("")).rejects.toThrow("saved draft");
    await expect(draft.persist("new")).rejects.toThrow("saved draft");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("retains a malformed file draft and enables writes only after a successful retry", async () => {
    const storage = {
      getItem: vi
        .fn()
        .mockResolvedValueOnce("{malformed")
        .mockResolvedValueOnce(JSON.stringify({ expected: "before", content: "saved edit" })),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const draft = new DraftStore(storage, "machine-a:file", parseFileDraft, (value) =>
      value ? JSON.stringify(value) : null,
    );
    await expect(draft.load()).rejects.toThrow();
    await expect(draft.persist(null)).rejects.toThrow("saved draft");
    await expect(draft.load()).resolves.toEqual({ expected: "before", content: "saved edit" });
    await draft.persist({ expected: "before", content: "next edit" });
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledWith(
      "machine-a:file",
      JSON.stringify({ expected: "before", content: "next edit" }),
    );
  });

  it("binds explicit and manual workspace routes to one computer for their lifetime", () => {
    const explicit = new RouteMachine("machine-a");
    expect(explicit.matches("machine-a")).toBe(true);
    expect(explicit.matches("machine-b")).toBe(false);
    const manual = new RouteMachine("active-at-mount");
    expect(manual.matches("new-active")).toBe(false);
    expect(manual.origin).toBe("active-at-mount");
    expect(new RouteMachine(null).matches("later-computer")).toBe(false);
  });

  it("keeps the editor open when retaining its draft fails, then leaves after a successful retry", async () => {
    const storage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi
        .fn()
        .mockRejectedValueOnce(new Error("Storage full"))
        .mockResolvedValueOnce(undefined),
      removeItem: vi.fn(),
    };
    const draft = new DraftStore<string>(
      storage,
      "machine:file",
      (value) => value,
      (value) => value,
    );
    const leave = vi.fn();
    await draft.load();
    await expect(retainDraftThenLeave(draft, "unsaved changes", leave)).rejects.toThrow(
      "Storage full",
    );
    expect(leave).not.toHaveBeenCalled();
    await retainDraftThenLeave(draft, "unsaved changes", leave);
    expect(leave).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenLastCalledWith("machine:file", "unsaved changes");
  });
});
