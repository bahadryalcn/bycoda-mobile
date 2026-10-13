import { describe, expect, it, vi } from "vitest";
import { diffLines, readEarlier, readSession, readTail, resolveSync } from "./wire";
import type { HostSession } from "./wire";

const snapshot = (revision = 1): HostSession => ({
  projectId: "project",
  revision,
  status: "idle",
  updatedAt: 1,
  session: {
    id: "session",
    cwd: "/repo",
    harness: "codex",
    model: "codex:model",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Session",
    blocks: [{ id: "tail", role: "assistant", text: "tail" }],
  },
  history: { before: 1, revision, totalBlocks: 2 },
});
const client = (request: ReturnType<typeof vi.fn>) => ({
  request: request as <T>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<T>,
});

describe("mobile transcript wire", () => {
  it("loads a bounded tail rather than requesting the complete transcript", async () => {
    const value = snapshot();
    const request = vi.fn().mockResolvedValue({ sync: { kind: "snapshot", value } });
    await expect(readTail(client(request), "session")).resolves.toEqual(value);
    expect(request).toHaveBeenCalledWith(
      "sessions.page",
      { sessionId: "session", preview: true },
      {},
    );
  });

  it("sends the loaded window and applies a partial delta without losing existing blocks", async () => {
    const known = snapshot();
    const current = snapshot(2);
    const delta = {
      kind: "delta",
      partial: true,
      base: 1,
      value: { ...current, session: { ...current.session, blocks: undefined } },
      blockIds: ["tail", "new"],
      blocks: [{ id: "new", role: "assistant", text: "appended" }],
    };
    const request = vi.fn().mockResolvedValue(delta);
    const result = await readSession(client(request), "session", known);
    expect(result.session.blocks.map((block) => block.id)).toEqual(["tail", "new"]);
    expect(request).toHaveBeenCalledWith(
      "sessions.sync",
      { sessionId: "session", revision: 1, preview: true, partial: true, loadedBlockIds: ["tail"] },
      {},
    );
  });

  it("recovers an obsolete delta with a fresh tail instead of applying it", async () => {
    const fresh = snapshot(4);
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "delta",
        base: 0,
        value: snapshot(2),
        blockIds: [],
        blocks: [],
      })
      .mockResolvedValueOnce({ sync: { kind: "snapshot", value: fresh } });
    await expect(readSession(client(request), "session", snapshot())).resolves.toEqual(fresh);
    expect(request.mock.calls.map((call) => call[0])).toEqual(["sessions.sync", "sessions.page"]);
  });

  it("rejects another session identity without attempting to replace the cache", async () => {
    const value = snapshot();
    value.session.id = "other-session";
    const request = vi.fn().mockResolvedValue({ kind: "snapshot", value });
    await expect(readSession(client(request), "session", snapshot())).rejects.toThrow("identity");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("assembles chunks using UTF-16 offsets and carries cancellation to every request", async () => {
    const sync = { kind: "snapshot", value: snapshot() };
    sync.value.session.blocks[0].text = "🙂";
    const json = JSON.stringify(sync);
    const split = json.indexOf("🙂") + 1;
    const signal = new AbortController().signal;
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: json.slice(0, split) })
      .mockResolvedValueOnce({ data: json.slice(split) });
    await expect(
      resolveSync(
        client(request),
        "session",
        { kind: "chunked", transfer: "transfer", length: json.length },
        { signal },
      ),
    ).resolves.toEqual(sync);
    expect(request.mock.calls[1][1].offset).toBe(split);
    expect(request.mock.calls.every((call) => call[2].signal === signal)).toBe(true);
  });

  it("rejects an empty transfer chunk and prevents an unbounded retry loop", async () => {
    const request = vi.fn().mockResolvedValue({ data: "" });
    await expect(
      resolveSync(client(request), "session", { kind: "chunked", transfer: "t", length: 100 }),
    ).rejects.toThrow("incomplete");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("merges earlier pages without overwriting an already-loaded newer block", async () => {
    const known = snapshot();
    const older = snapshot();
    older.history = { revision: 1, totalBlocks: 2 };
    older.session.blocks = [
      { id: "older", role: "user", text: "older" },
      { id: "tail", role: "assistant", text: "stale overlap" },
    ];
    const request = vi.fn().mockResolvedValue({ sync: { kind: "snapshot", value: older } });
    const result = await readEarlier(client(request), known);
    expect(result.session.blocks.map((block) => block.text)).toEqual(["older", "tail"]);
    expect(result.history?.before).toBeUndefined();
  });

  it("refuses an earlier page from a different revision", async () => {
    const request = vi.fn().mockResolvedValue({ sync: { kind: "snapshot", value: snapshot(2) } });
    await expect(readEarlier(client(request), snapshot())).rejects.toThrow("changed");
  });

  it("preserves plus/minus markers and bounds very large diff output", () => {
    expect(diffLines("same\nbefore\nend", "same\nafter\nend").lines).toEqual([
      { kind: "same", text: "same", oldLine: 1, newLine: 1 },
      { kind: "remove", text: "before", oldLine: 2 },
      { kind: "add", text: "after", newLine: 2 },
      { kind: "same", text: "end", oldLine: 3, newLine: 3 },
    ]);
    const bounded = diffLines("before\n".repeat(6000), "after\n".repeat(6000), {
      maxEditLength: 1,
    });
    expect(bounded.tooLarge).toBe(true);
    expect(bounded.lines).toEqual([]);
  });

  it("keeps unchanged interior lines unchanged between separated edits", () => {
    const preview = diffLines("old-a\nkeep-1\nkeep-2\nold-b", "new-a\nkeep-1\nkeep-2\nnew-b");
    expect(preview.lines.filter((line) => line.text.startsWith("keep-"))).toEqual([
      { kind: "same", text: "keep-1", oldLine: 2, newLine: 2 },
      { kind: "same", text: "keep-2", oldLine: 3, newLine: 3 },
    ]);
    expect(preview.lines.filter((line) => line.kind === "remove").map((line) => line.text)).toEqual(
      ["old-a", "old-b"],
    );
  });

  it("shows an explicit unchanged state for identical files", () => {
    expect(diffLines("same\nfile", "same\nfile")).toEqual({
      lines: [],
      tooLarge: false,
      truncated: false,
      unchanged: true,
    });
  });
  it("retains real line numbers across omitted context and inserted lines", () => {
    const before = Array.from({ length: 24 }, (_, i) => `line-${i + 1}`);
    const after = [...before];
    after.splice(12, 1, "replacement-a", "replacement-b");
    const preview = diffLines(before.join("\n"), after.join("\n"));
    expect(preview.lines.find((line) => line.kind === "remove")).toMatchObject({
      text: "line-13",
      oldLine: 13,
    });
    expect(preview.lines.filter((line) => line.kind === "add").map((line) => line.newLine)).toEqual(
      [13, 14],
    );
    expect(preview.lines.find((line) => line.text === "line-14")).toMatchObject({
      oldLine: 14,
      newLine: 15,
    });
  });
  it("does not confuse a real ellipsis line with omitted context", () => {
    const preview = diffLines("old\n⋯\nend", "new\n⋯\nend");
    expect(preview.lines.find((line) => line.text === "⋯")).toMatchObject({
      kind: "same",
      oldLine: 2,
      newLine: 2,
    });
  });
});
