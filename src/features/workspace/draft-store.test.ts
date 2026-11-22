import { describe, expect, it, vi } from "vitest";
import {
  DraftStore,
  encodeFileDraft,
  flushLatestDraft,
  parseFileDraft,
  retainDraftThenLeave,
  type FileDraft,
} from "./draft-store";
import { RouteMachine } from "./route-machine";

describe("compact file drafts", () => {
  const baseline = `${"line of the original file\n".repeat(400)}tail\n`;
  const edited = (content: string): FileDraft => ({ expected: baseline, content });

  it("stores the baseline once and only the changed region of the edit", () => {
    const draft = edited(baseline.replace("line of the original file\nline", "line of the CHANGED file\nline"));
    const raw = encodeFileDraft(draft)!;
    expect(raw.split("line of the original file").length - 1).toBe(
      baseline.split("line of the original file").length - 1,
    );
    expect(raw.length).toBeLessThan(JSON.stringify(draft).length * 0.6);
    expect(parseFileDraft(raw)).toEqual(draft);
  });

  it("round-trips the exact expected baseline that files.write compares", () => {
    for (const content of [
      "",
      "x",
      baseline + "appended",
      "prepended" + baseline,
      baseline.slice(10, -10),
      baseline.replace("tail", "😀 tail"),
      "completely different",
    ]) {
      const decoded = parseFileDraft(encodeFileDraft(edited(content))!);
      expect(decoded.expected).toBe(baseline);
      expect(decoded.content).toBe(content);
    }
  });

  it("never splits a surrogate pair and keeps overlapping edits lossless", () => {
    const cases: FileDraft[] = [
      { expected: "a😀b", content: "a😁b" },
      { expected: "a😀", content: "a😁" },
      { expected: "😀😀", content: "😀" },
      { expected: "aaa", content: "aaaa" },
      { expected: "aaaa", content: "aa" },
      { expected: "", content: "new" },
    ];
    for (const draft of cases) {
      const raw = encodeFileDraft(draft)!;
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(parseFileDraft(raw)).toEqual(draft);
      const { insert } = JSON.parse(raw) as { insert: string };
      expect(insert.isWellFormed()).toBe(true);
    }
  });

  it("stores nothing for a clean draft and serializes a draft object only once", () => {
    expect(encodeFileDraft(null)).toBeNull();
    expect(encodeFileDraft({ expected: baseline, content: baseline })).toBeNull();
    const draft = edited("changed");
    const stringify = vi.spyOn(JSON, "stringify");
    const first = encodeFileDraft(draft);
    const calls = stringify.mock.calls.length;
    expect(encodeFileDraft(draft)).toBe(first);
    expect(encodeFileDraft(draft)).toBe(first);
    expect(stringify.mock.calls.length).toBe(calls);
    stringify.mockRestore();
  });

  it("still reads drafts stored before the compact format", () => {
    expect(parseFileDraft(JSON.stringify({ expected: "before", content: "after" }))).toEqual({
      expected: "before",
      content: "after",
    });
  });

  it("rejects malformed compact drafts instead of inventing content", () => {
    for (const record of [
      { expected: "abc", prefix: 2, suffix: 2, insert: "" },
      { expected: "abc", prefix: -1, suffix: 0, insert: "" },
      { expected: "abc", prefix: 1.5, suffix: 0, insert: "" },
      { expected: "abc", prefix: 1, suffix: 1 },
      { prefix: 0, suffix: 0, insert: "" },
      { expected: 1, content: "x" },
    ])
      expect(() => parseFileDraft(JSON.stringify(record))).toThrow("could not be loaded");
    expect(() => parseFileDraft("null")).toThrow("could not be loaded");
  });

  it("does not rewrite an unchanged or already stored draft but rewrites a legacy record and failed writes", async () => {
    const stored = edited("changed");
    const compact = encodeFileDraft(stored)!;
    const storage = {
      getItem: vi.fn().mockResolvedValue(compact),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const draft = new DraftStore(storage, "machine:file", parseFileDraft, encodeFileDraft);
    const loaded = (await draft.load())!;
    await draft.persist(loaded);
    expect(storage.setItem).not.toHaveBeenCalled();
    const next = { ...loaded, content: "changed again" };
    await draft.persist(next);
    await draft.persist(next);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("machine:file", encodeFileDraft(next));
    await draft.persist(null);
    await draft.persist(null);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);

    const legacy = {
      getItem: vi.fn().mockResolvedValue(JSON.stringify({ expected: "before", content: "after" })),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn(),
    };
    const old = new DraftStore(legacy, "machine:legacy", parseFileDraft, encodeFileDraft);
    const legacyDraft = (await old.load())!;
    await old.persist(legacyDraft);
    expect(legacy.setItem).toHaveBeenCalledOnce();
    expect(parseFileDraft(legacy.setItem.mock.calls[0][1])).toEqual({ expected: "before", content: "after" });

    const failing = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockRejectedValueOnce(new Error("Storage full")).mockResolvedValue(undefined),
      removeItem: vi.fn(),
    };
    const retry = new DraftStore(failing, "machine:retry", parseFileDraft, encodeFileDraft);
    await retry.load();
    const pending = edited("unsaved");
    await expect(retry.persist(pending)).rejects.toMatchObject({
      message: "Storage full",
      cause: expect.objectContaining({ message: "Storage full" }),
    });
    await retry.persist(pending);
    expect(failing.setItem).toHaveBeenCalledTimes(2);
  });
});

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
