import { describe, expect, it } from "vitest";
import { TranscriptPresentation, transcriptEntries, withoutOfferedInterruption } from "./transcript-model";
import { applyToolVisibility } from "./transcript-visibility";
import {
  displayChangedPath,
  sameTurnSummary,
  splitChangedPath,
  turnChangedFiles,
  turnSearchSources,
  turnSummary,
} from "./transcript-turn-summary";
import type { Block } from "./wire";

const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({ id, role, text: id, ...fields });
const edit = (id: string, path: string, counts?: { additions: number; deletions: number }, extra: Partial<NonNullable<Block["tool"]>> = {}) =>
  block(id, "tool", { tool: { title: "Edit", kind: "edit", status: "completed", fileChanges: [{ path, ...(counts ? { counts } : {}) }], ...extra } });
const search = (id: string, sources: { title: string; url: string; domain: string }[]) =>
  block(id, "tool", { tool: { title: "Web search", kind: "search", status: "completed", preview: { kind: "search", sources } } });

describe("turn changed files", () => {
  it("sums a file's edits in first-edit order and records every edit that touched it", () => {
    const files = turnChangedFiles([
      edit("e1", "src/a.ts", { additions: 2, deletions: 1 }),
      edit("e2", "src/b.ts", { additions: 5, deletions: 0 }),
      edit("e3", "src\\a.ts", { additions: 3, deletions: 4 }),
    ]);
    expect(files.map((file) => [file.path, file.counts, file.blockIds])).toEqual([
      ["src/a.ts", { additions: 5, deletions: 5 }, ["e1", "e3"]],
      ["src/b.ts", { additions: 5, deletions: 0 }, ["e2"]],
    ]);
  });

  it("drops the total when one edit has no counts, like desktop", () => {
    const [file] = turnChangedFiles([edit("e1", "a.ts", { additions: 1, deletions: 0 }), edit("e2", "a.ts")]);
    expect(file?.counts).toBeUndefined();
    expect(file?.blockIds).toEqual(["e1", "e2"]);
  });

  it("keeps an added file added when it is edited again, and records a later delete", () => {
    const added = (id: string, status: "added" | "modified" | "deleted") =>
      block(id, "tool", { tool: { status: "completed", fileChanges: [{ path: "new.ts", status }] } });
    expect(turnChangedFiles([added("a", "added"), added("b", "modified")])[0]?.status).toBe("added");
    expect(turnChangedFiles([added("a", "added"), added("b", "deleted")])[0]?.status).toBe("deleted");
  });

  it("counts completed, approved tool records only", () => {
    expect(turnChangedFiles([
      edit("run", "a.ts", undefined, { status: "running" }),
      edit("fail", "b.ts", undefined, { status: "failed" }),
      { ...edit("deny", "c.ts"), approval: { requestId: 1, decided: "deny" } },
      { ...edit("assistant", "d.ts"), role: "assistant" },
      edit("ok", "e.ts", undefined, { status: "success" }),
    ]).map((file) => file.path)).toEqual(["e.ts"]);
  });

  it("falls back to a write preview when the provider reports no fileChanges", () => {
    const write = block("w", "tool", { tool: { status: "completed", preview: { kind: "write", path: "x.ts", lines: [
      { kind: "add", text: "a" }, { kind: "add", text: "b" }, { kind: "del", text: "c" },
    ] } } });
    const contentOnly = block("c", "tool", { tool: { status: "completed", preview: { kind: "write", path: "y.ts", contentOnly: true } } });
    expect(turnChangedFiles([write, contentOnly]).map((file) => [file.path, file.counts])).toEqual([
      ["x.ts", { additions: 2, deletions: 1 }],
      ["y.ts", undefined],
    ]);
  });

  it("treats Windows drive paths case-insensitively", () => {
    expect(turnChangedFiles([edit("a", "C:\\Repo\\A.ts"), edit("b", "c:/repo/a.ts")])).toHaveLength(1);
  });
});

describe("turn sources", () => {
  it("lists each web page once in search order and ignores non-web links", () => {
    const a = { title: "A", url: "https://a.dev/x", domain: "a.dev" };
    const b = { title: "", url: "http://b.dev", domain: "b.dev" };
    const bad = { title: "Bad", url: "javascript:alert(1)", domain: "bad" };
    expect(turnSearchSources([search("s1", [a, bad]), search("s2", [a, b])])).toEqual([a, { ...b, title: "b.dev" }]);
  });

  it("is absent when the turn neither changed files nor searched", () => {
    expect(turnSummary([block("u", "user"), block("a", "assistant")])).toBeUndefined();
  });
});

describe("turn summary presentation", () => {
  const turn = [
    block("u1", "user", { durationMs: 5 }),
    edit("e1", "src/a.ts", { additions: 1, deletions: 0 }),
    block("a1", "assistant"),
    block("u2", "user", { durationMs: 5 }),
    block("a2", "assistant"),
  ];

  it("follows the settled turn's last entry, beside its receipt", () => {
    const entries = transcriptEntries(turn, "codex", { view: "messages", running: false });
    const last = entries.find((entry) => entry.id === "a1");
    expect(last?.footer?.id).toBe("u1");
    expect(last?.turnSummary?.files.map((file) => file.path)).toEqual(["src/a.ts"]);
    expect(entries.filter((entry) => entry.turnSummary)).toHaveLength(1);
  });

  it("waits for the running turn to settle", () => {
    const live = [...turn.slice(0, 3)];
    expect(transcriptEntries(live, "codex", { view: "messages", running: true }).some((entry) => entry.turnSummary)).toBe(false);
    expect(transcriptEntries(live, "codex", { view: "messages", running: false }).at(-1)?.turnSummary).toBeDefined();
  });

  it("includes work done after a steer in the same turn", () => {
    const steered = [
      block("u1", "user", { durationMs: 5 }),
      edit("e1", "a.ts"),
      block("s1", "user", { continuationOf: "u1" }),
      edit("e2", "b.ts"),
      block("a1", "assistant"),
    ];
    const entries = transcriptEntries(steered, "codex", { view: "messages", running: false });
    expect(entries.at(-1)?.turnSummary?.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("keeps a queued draft from closing the running turn with a partial summary", () => {
    const queued = [
      block("u1", "user", { durationMs: 5 }),
      edit("e1", "a.ts"),
      block("q", "user", { draft: true }),
      edit("e2", "b.ts"),
      block("a1", "assistant"),
    ];
    const live = transcriptEntries(queued, "codex", { view: "messages", running: true });
    expect(live.some((entry) => entry.turnSummary || entry.footer)).toBe(false);
    const settled = transcriptEntries(queued, "codex", { view: "messages", running: false });
    expect(settled.filter((entry) => entry.turnSummary)).toHaveLength(1);
    expect(settled.at(-1)?.id).toBe("a1");
    expect(settled.at(-1)?.turnSummary?.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
    expect(settled.at(-1)?.footer?.id).toBe("u1");
    // A draft left at the end keeps the receipt on the turn's own last row.
    const trailing = transcriptEntries([...queued, block("q2", "user", { draft: true })], "codex", { view: "messages", running: false });
    expect(trailing.find((entry) => entry.id === "a1")?.turnSummary).toBeDefined();
    expect(trailing.at(-1)?.turnSummary).toBeUndefined();
  });

  it("moves with the receipt when tool filtering hides the turn's last entry", () => {
    const endsWithTool = [block("u1", "user", { durationMs: 5 }), block("a1", "assistant"), edit("e1", "a.ts")];
    const entries = transcriptEntries(endsWithTool, "codex", { view: "messages", running: false });
    expect(entries.at(-1)?.turnSummary).toBeDefined();
    const hidden = applyToolVisibility(entries, "hide-all", false);
    expect(hidden.at(-1)?.id).toBe("a1");
    expect(hidden.at(-1)?.turnSummary?.files[0]?.blockIds).toEqual(["e1"]);
  });

  it("moves with the receipt when Continue replaces the trailing interruption notice", () => {
    const cut = [
      block("u1", "user", { durationMs: 5 }),
      edit("e1", "a.ts"),
      block("a1", "assistant"),
      block("n", "system", { notice: "interrupt", text: "Turn interrupted" }),
    ];
    const entries = transcriptEntries(cut, "codex", { view: "messages", running: false });
    expect(entries.at(-1)?.id).toBe("n");
    const out = withoutOfferedInterruption(entries);
    expect(out.at(-1)?.id).toBe("a1");
    expect(out.at(-1)?.footer?.id).toBe("u1");
    expect(out.at(-1)?.turnSummary?.files[0]?.path).toBe("a.ts");
  });

  it("keeps a settled turn's entry identity across an unrelated append", () => {
    const presentation = new TranscriptPresentation();
    const first = presentation.update(turn.slice(0, 3), "codex", { view: "messages", running: false });
    const withSummary = first.find((entry) => entry.turnSummary);
    const next = presentation.update([...turn.slice(0, 3), { ...turn[3]! }], "codex", { view: "messages", running: false });
    expect(next.find((entry) => entry.id === withSummary?.id)).toBe(withSummary);
  });

  it("compares summaries structurally", () => {
    const a = turnSummary([edit("e", "a.ts", { additions: 1, deletions: 0 })]);
    const b = turnSummary([edit("e", "a.ts", { additions: 1, deletions: 0 })]);
    expect(sameTurnSummary(a, b)).toBe(true);
    expect(sameTurnSummary(a, turnSummary([edit("e", "a.ts", { additions: 2, deletions: 0 })]))).toBe(false);
  });
});

describe("changed path display", () => {
  it("reads workspace files relative to the session folder", () => {
    expect(displayChangedPath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
    expect(displayChangedPath("C:\\Repo\\src\\a.ts", "c:\\repo\\")).toBe("src/a.ts");
    expect(displayChangedPath("/other/a.ts", "/repo")).toBe("/other/a.ts");
    expect(displayChangedPath("src/a.ts", undefined)).toBe("src/a.ts");
  });

  it("leads with the file name", () => {
    expect(splitChangedPath("src/ui/a.ts")).toEqual({ name: "a.ts", folder: "src/ui" });
    expect(splitChangedPath("a.ts")).toEqual({ name: "a.ts" });
  });
});
