import { describe, expect, it } from "vitest";
import type { Block } from "./wire";
import { transcriptEntries } from "./transcript-model";
import {
  findTranscript,
  findTranscriptAsync,
  TranscriptFindIndex,
  nextTranscriptResult,
  currentTranscriptFind,
  matchingTranscriptActivity,
} from "./transcript-find-model";

const block = (
  id: string,
  role: Block["role"],
  text: string,
  extra: Partial<Block> = {},
): Block => ({ id, role, text, ...extra });
const entries = (blocks: Block[], view: "messages" | "details" = "details") =>
  transcriptEntries(blocks, undefined, { view, running: false });
describe("loaded transcript find", () => {
  it("yields large searches, preserves results, and cancels a superseded scan", async () => {
    const rows = entries(
      Array.from({ length: 1000 }, (_, i) =>
        block(`block-${i}`, "assistant", `Result needle ${i}`),
      ),
    );
    const controller = new AbortController();
    const index = new TranscriptFindIndex();
    let yields = 0;
    const matches = await findTranscriptAsync(rows, "needle", {
      signal: controller.signal,
      index,
      yield: async () => {
        yields++;
      },
    });
    expect(yields).toBeGreaterThan(0);
    expect(matches).toEqual(findTranscript(rows, "needle"));
    const cancelled = await findTranscriptAsync(rows, "needle", {
      signal: controller.signal,
      index,
      yield: async () => controller.abort(),
    });
    expect(cancelled).toEqual([]);
  });
  it("returns chronological block results with their list index and literal matching", () => {
    const rows = entries([
      block("first", "user", "Need [test]"),
      block("last", "assistant", "[TEST] [test]"),
    ]);
    expect(findTranscript(rows, " [test] ").map(({ blockId, index }) => [blockId, index])).toEqual([
      ["first", 0],
      ["last", 1],
    ]);
    expect(findTranscript(rows, "  ")).toEqual([]);
  });
  it("searches loaded tool results, folded work and attachment names but excludes internal blocks", () => {
    const blocks = [
      block("internal", "user", "secret", { internal: true }),
      block("tool", "tool", "command", { tool: { output: "found needle" } }),
      block("answer", "assistant", "done", {
        attachments: [
          { id: "file", name: "needle.txt", mimeType: "text/plain", kind: "file", size: 10 },
        ],
      }),
    ];
    expect(findTranscript(entries(blocks), "needle").map((hit) => hit.blockId)).toEqual([
      "tool",
      "answer",
    ]);
    expect(findTranscript(entries(blocks, "messages"), "needle").map((hit) => hit.blockId)).toEqual(
      ["tool", "answer"],
    );
    expect(findTranscript(entries(blocks), "secret")).toEqual([]);
  });
  it("maps each grouped activity result to the same virtualized row without losing block identity", () => {
    const rows = entries([block("a", "tool", "needle a"), block("b", "tool", "needle b")]);
    expect(
      findTranscript(rows, "needle").map((hit) => [hit.blockId, hit.entryId, hit.index]),
    ).toEqual([
      ["a", "activity:a", 0],
      ["b", "activity:a", 0],
    ]);
  });
  it("retires a result snapshot immediately when the transcript or query changes", () => {
    const rows = entries([block("a", "assistant", "needle")]);
    const snapshot = { entries: rows, query: "needle", results: findTranscript(rows, "needle") };
    expect(currentTranscriptFind(snapshot, rows, "needle", true)).toBe(snapshot);
    expect(currentTranscriptFind(snapshot, [...rows], "needle", true)).toBeUndefined();
    expect(currentTranscriptFind(snapshot, rows, "new query", true)).toBeUndefined();
    expect(currentTranscriptFind(snapshot, rows, "needle", false)).toBeUndefined();
  });
  it("opens the matching activity by identity after a prepend and rejects a missing block", () => {
    const rows = entries([block("a", "tool", "needle a"), block("b", "tool", "needle b")]);
    const hit = findTranscript(rows, "needle")[1]!;
    const olderRows = entries([block("older", "tool", "old command")]);
    expect(matchingTranscriptActivity([...olderRows, ...rows], hit)?.id).toBe("activity:a");
    expect(matchingTranscriptActivity(entries([block("a", "tool", "needle a")]), hit)).toBeUndefined();
  });
  it("wraps navigation and preserves active identity after earlier messages load", () => {
    const original = findTranscript(
      entries([block("a", "user", "needle"), block("b", "assistant", "needle")]),
      "needle",
    );
    expect(nextTranscriptResult(original, null, 1)?.blockId).toBe("a");
    expect(nextTranscriptResult(original, null, -1)?.blockId).toBe("b");
    expect(nextTranscriptResult(original, "b", 1)?.blockId).toBe("a");
    const loaded = findTranscript(
      entries([
        block("older", "user", "needle"),
        block("a", "user", "needle"),
        block("b", "assistant", "needle"),
      ]),
      "needle",
    );
    expect(nextTranscriptResult(loaded, "a", 1)?.blockId).toBe("b");
    expect(nextTranscriptResult([], "a", 1)).toBeUndefined();
  });
  it("keeps result snippets bounded around a late match in a large loaded preview", () => {
    const result = findTranscript(
      entries([block("a", "assistant", "x".repeat(10000) + "needle" + "y".repeat(10000))]),
      "needle",
    )[0]!;
    expect(result.snippet).toContain("needle");
    expect(result.snippet.length).toBeLessThanOrEqual(182);
  });
});
