import { expect, it } from "vitest";
import { readWorktreeRemoval, readWorktreeRemovalStatus } from "./worktree-removal-model";
const review = { reviewId: "review", expiresAt: 100, projectCwd: "/repo", path: "/trees/task", branch: "task", head: "abc", dirty: false, unpushed: 0, sessionIds: ["idle"], activeSessionIds: [], hasTerminals: false, hasAgents: false, hasOpenFiles: false, canRemove: true, reasons: [], effects: { detachSessionIds: ["idle"], rebindProjectCwd: "/repo" }, atomic: false };
it("accepts the bounded non-atomic exact worktree review and opaque statuses", () => {
  expect(readWorktreeRemoval(review, review.path)).toEqual(review);
  for (const state of ["unknown", "pending", "applied", "failed"]) expect(readWorktreeRemovalStatus({ state })).toEqual({ state });
});
it("refuses retargeted reviews, injected force and inconsistent safe-removal claims", () => {
  for (const value of [{ ...review, path: "/foreign" }, { ...review, force: true }, { ...review, atomic: true }, { ...review, unpushed: null }, { ...review, dirty: true }, { ...review, hasAgents: true }, { ...review, effects: { ...review.effects, detachSessionIds: [] } }]) expect(() => readWorktreeRemoval(value, review.path)).toThrow();
  expect(() => readWorktreeRemovalStatus({ state: "applied", force: true })).toThrow();
  expect(() => readWorktreeRemovalStatus({ state: "cancelled" })).toThrow();
});
