import { expect, it } from "vitest";
import { decodePrReviewDraft, emptyPrReviewDraft, encodePrReviewDraft, prReviewDraftKey, reviewedPrReceipt, settlePrReviewDraft } from "./provider-review-draft";
const draft = { ...emptyPrReviewDraft(), commitId: "a".repeat(40), body: "Exact summary", comments: [{ path: "src/file.ts", side: "LEFT" as const, line: 3, body: "Exact old-side comment" }], pending: { requestId: "attempt-1", environmentId: "environment-a" } };
it("persists exact reviewed head, comments and attempt without storing the full repository diff", () => {
  expect(decodePrReviewDraft(encodePrReviewDraft(draft)!)).toEqual(draft);
  const item = { provider: "github", repo: "owner/repo", kind: "pr", number: 1 } as never;
  expect(prReviewDraftKey({ machineId: "machine-a", projectId: "project" }, item)).not.toBe(prReviewDraftKey({ machineId: "machine-b", projectId: "project" }, item));
  for (const change of [{ commitId: "HEAD" }, { body: "x".repeat(30_001) }, { pending: { requestId: 7, environmentId: "environment-a" } }])
    expect(() => decodePrReviewDraft(JSON.stringify({ ...draft, ...change }))).toThrow();
});
it("unlocks only the matching known terminal attempt", () => {
  for (const state of ["queued", "running", "uncertain"] as const)
    expect(settlePrReviewDraft(draft, "attempt-1", { id: "job", state })).toBe(draft);
  expect(settlePrReviewDraft(draft, "another", { id: "job", state: "completed" })).toBe(draft);
  expect(settlePrReviewDraft(draft, "attempt-1", { id: "job", state: "completed" })).toMatchObject({ body: draft.body, comments: draft.comments, pending: undefined, completed: true });
  expect(settlePrReviewDraft(draft, "attempt-1", { id: "job", state: "failed" })).toMatchObject({ body: draft.body, comments: draft.comments, pending: undefined });
  for (const value of [null, {}, { id: "job", state: "missing" }]) expect(() => reviewedPrReceipt(value)).toThrow();
});
