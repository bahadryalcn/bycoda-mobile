import { expect, it } from "vitest";
import { historySelection, readHistoryPreview, readHistoryStatus } from "./history-import-model";
const preview = {
  reviewId: "review",
  digest: "a".repeat(64),
  expiresAt: 1000,
  environmentId: "env",
  sourceSessionId: "session",
  omitted: 0,
  candidates: [
    {
      id: "candidate",
      provider: "codex",
      prompt: "Example",
      startedAt: 0,
      lastAt: 1,
      sizeBytes: 100,
      resumable: true,
      kind: "interactive",
      imported: false,
    },
  ],
};
it("accepts only bounded safe metadata for the exact environment/source", () => {
  expect(readHistoryPreview(preview, "env", "session")).toEqual(preview);
  expect(() => readHistoryPreview(preview, "other", "session")).toThrow();
  expect(() =>
    readHistoryPreview(
      { ...preview, candidates: [{ ...preview.candidates[0], path: "/secret" }] },
      "env",
      "session",
    ),
  ).toThrow();
  expect(() =>
    readHistoryPreview(
      { ...preview, candidates: Array(501).fill(preview.candidates[0]) },
      "env",
      "session",
    ),
  ).toThrow();
});
it("pins a current unimported selection and rejects expired/fabricated/duplicate imports", () => {
  const review = readHistoryPreview(preview, "env", "session");
  expect(historySelection(review, new Set(["candidate"]), 10).digest).toBe(review.digest);
  expect(() => historySelection(review, new Set(["candidate"]), 1001)).toThrow();
  expect(() => historySelection(review, new Set(["other"]), 10)).toThrow();
  expect(() =>
    historySelection(
      { ...review, candidates: [{ ...review.candidates[0], imported: true }] },
      new Set(["candidate"]),
      10,
    ),
  ).toThrow();
});
it("retains unknown and partial-cancelled counts while refusing raw progress paths", () => {
  expect(() => readHistoryStatus({ state: ["unknown"] })).toThrow();
  expect(readHistoryStatus({ state: "unknown" })).toEqual({ state: "unknown" });
  expect(
    readHistoryStatus({
      state: "complete",
      result: { imported: 2, skipped: 1, failed: 1, readOnly: 1, truncated: 0, cancelled: true },
    }).result?.imported,
  ).toBe(2);
  expect(() =>
    readHistoryStatus({
      state: "running",
      progress: { total: 1, done: 0, imported: 0, skipped: 0, failed: 0, current: "/private/path" },
    }),
  ).toThrow();
});
