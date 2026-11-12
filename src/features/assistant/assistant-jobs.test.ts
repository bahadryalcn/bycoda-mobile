import { expect, it } from "vitest";
import { jobActions, jobHold, jobNeedsAttention, jobVisible } from "./assistant-jobs";

const job = (status: string, extra = {}) =>
  ({
    id: "j",
    version: 1,
    title: "T",
    status,
    projectId: "p1",
    progress: { done: 0, total: 0 },
    ...extra,
  }) as never;

it("explains a hold only for work that has not started", () => {
  const holds = { j: "report" as const };
  expect(jobHold(job("queued"), holds)).toBe("report");
  expect(jobHold(job("waiting"), holds)).toBe("report");
  expect(jobHold(job("running"), holds)).toBeUndefined();
  expect(jobHold(job("queued"), undefined)).toBeUndefined();
});
it("offers pause or resume plus stop only where the Host can accept them", () => {
  expect(jobActions(job("running"))).toEqual(["pause", "stop"]);
  expect(jobActions(job("stalled"))).toEqual(["pause", "stop"]);
  expect(jobActions(job("paused"))).toEqual(["resume", "stop"]);
  expect(jobActions(job("done"))).toEqual([]);
  expect(jobActions(job("failed"))).toEqual([]);
  expect(jobActions(job("running", { pendingTaskDeletion: true }))).toEqual([]);
  expect(jobNeedsAttention(job("failed"))).toBe(true);
  expect(jobNeedsAttention(job("done"))).toBe(false);
});
it("hides jobs whose project this phone cannot show", () => {
  const access = { ready: true, visible: (id: string) => id === "p1" };
  expect(jobVisible(job("running"), access)).toBe(true);
  expect(jobVisible(job("running", { projectIds: ["p1", "x"] }), access)).toBe(false);
  expect(jobVisible(job("running"), { ...access, ready: false })).toBe(false);
  expect(
    jobVisible(job("running", { projectId: null, projectIds: [] }), { ...access, ready: false }),
  ).toBe(true);
});
