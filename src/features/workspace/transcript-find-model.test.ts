import { describe, expect, it } from "vitest";
import type { Block } from "./wire";
import { transcriptEntries } from "./transcript-model";
import { findTranscript, nextTranscriptResult } from "./transcript-find-model";

const block = (id: string, role: Block["role"], text: string, extra: Partial<Block> = {}): Block => ({ id, role, text, ...extra });
const entries = (blocks: Block[], view: "messages" | "details" = "details") => transcriptEntries(blocks, undefined, { view, running: false }).reverse();
describe("loaded transcript find", () => {
  it("returns chronological block results with their inverted-list index and literal matching", () => {
    const rows = entries([block("first", "user", "Need [test]"), block("last", "assistant", "[TEST] [test]")]);
    expect(findTranscript(rows, " [test] ").map(({ blockId, index }) => [blockId, index])).toEqual([["first", 1], ["last", 0]]);
    expect(findTranscript(rows, "  ")).toEqual([]);
  });
  it("searches loaded tool results and attachment names but excludes hidden/internal blocks", () => {
    const blocks = [block("internal", "user", "secret", { internal: true }),
      block("tool", "tool", "command", { tool: { output: "found needle" } }),
      block("answer", "assistant", "done", { attachments: [{ id: "file", name: "needle.txt", mimeType: "text/plain", kind: "file", size: 10 }] })];
    expect(findTranscript(entries(blocks), "needle").map((hit) => hit.blockId)).toEqual(["tool", "answer"]);
    expect(findTranscript(entries(blocks, "messages"), "needle").map((hit) => hit.blockId)).toEqual(["answer"]);
    expect(findTranscript(entries(blocks), "secret")).toEqual([]);
  });
  it("maps each grouped activity result to the same virtualized row without losing block identity", () => {
    const rows = entries([block("a", "tool", "needle a"), block("b", "tool", "needle b")]);
    expect(findTranscript(rows, "needle").map((hit) => [hit.blockId, hit.entryId, hit.index])).toEqual([["a", "activity:a", 0], ["b", "activity:a", 0]]);
  });
  it("wraps navigation and preserves active identity after earlier messages load", () => {
    const original = findTranscript(entries([block("a", "user", "needle"), block("b", "assistant", "needle")]), "needle");
    expect(nextTranscriptResult(original, null, 1)?.blockId).toBe("a");
    expect(nextTranscriptResult(original, null, -1)?.blockId).toBe("b");
    expect(nextTranscriptResult(original, "b", 1)?.blockId).toBe("a");
    const loaded = findTranscript(entries([block("older", "user", "needle"), block("a", "user", "needle"), block("b", "assistant", "needle")]), "needle");
    expect(nextTranscriptResult(loaded, "a", 1)?.blockId).toBe("b");
    expect(nextTranscriptResult([], "a", 1)).toBeUndefined();
  });
  it("keeps result snippets bounded around a late match in a large loaded preview", () => {
    const result = findTranscript(entries([block("a", "assistant", "x".repeat(10000) + "needle" + "y".repeat(10000))]), "needle")[0]!;
    expect(result.snippet).toContain("needle");
    expect(result.snippet.length).toBeLessThanOrEqual(182);
  });
});
