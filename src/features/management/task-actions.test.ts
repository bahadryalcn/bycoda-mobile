import { describe, expect, it } from "vitest";
import type { HostTask } from "@/domain/types";
import { taskActions, taskMatchesFilter, taskRunLimitForSave } from "./task-actions";

const task = (patch: Partial<HostTask>): HostTask => ({
  id: "task",
  title: "Work",
  prompt: "Implement",
  projectId: "project",
  harness: "codex",
  model: "model",
  modelSettings: {},
  runtimeMode: "auto",
  maxRunMinutes: 0,
  status: "todo",
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});
/** The Host's stop after the repair loop ended on an external check. */
const repairStop = (message: string): NonNullable<HostTask["stop"]> => ({
  code: "repair_exhausted",
  repair: "external",
  message,
  actor: "host",
  nextAction: "provide_input",
  at: 1,
});
/** The Host's stop after a review failed the worker's result. */
const reviewStop = (message: string): NonNullable<HostTask["stop"]> => ({
  code: "run_failed",
  phase: "review",
  message,
  actor: "provider",
  nextAction: "retry",
  at: 1,
});
describe("mobile task actions follow the host", () => {
  it("leaves crew task delivery acceptance to the crew review owner", () => {
    expect(taskActions(task({ status: "review", crewRunId: "crew-run" })).complete).toBe(false);
    expect(taskActions(task({ status: "review" })).complete).toBe(true);
  });
  it("offers review-only recheck for eligible blocked failures and retains host guards", () => {
    const failed = task({
      status: "blocked",
      sessionId: "worker",
      verification: {
        review: { verdict: "fail", note: "Needs another check", sessionId: "reviewer" },
      },
    });
    expect(taskActions(failed).recheck).toBe(true);
    expect(taskActions({ ...failed, status: "review" }).recheck).toBe(false);
    expect(taskActions({ ...failed, sessionId: undefined }).recheck).toBe(false);
    expect(taskActions({ ...failed, verification: undefined }).recheck).toBe(false);
    expect(
      taskActions({ ...failed, stop: repairStop("Needs input") }).recheck,
    ).toBe(false);
    // A canonical review failure can be taken over, so recheck stays off.
    expect(taskActions({ ...failed, stop: reviewStop("Needs another check") }).recheck).toBe(false);
  });
  it("includes verification in Running and keeps reviewed/done work out of Edit", () => {
    expect(taskMatchesFilter(task({ status: "verifying" }), "running")).toBe(true);
    expect(taskActions(task({ status: "review" })).edit).toBe(false);
    expect(taskActions(task({ status: "done" })).edit).toBe(false);
  });
  it("keeps an empty manual to-do editable but prevents running it", () => {
    expect(taskActions(task({ prompt: "" }))).toMatchObject({
      edit: true,
      queue: true,
      queueBlocked: true,
      complete: true,
    });
  });
  it("prevents returning an already-started queued task and completing unmerged manual work", () => {
    expect(taskActions(task({ status: "queued", sessionId: "session" })).toDo).toBe(false);
    expect(taskActions(task({ branch: "task-branch", merged: false })).complete).toBe(false);
  });
  it("offers owner restart only after required instructions are supplied", () => {
    expect(
      taskActions(
        task({
          status: "blocked",
          stop: repairStop("Needs credentials"),
        }),
      ).queueBlocked,
    ).toBe(true);
    expect(taskActions(task({ status: "review" }))).toMatchObject({
      queue: true,
      complete: true,
      stop: false,
    });
    expect(taskActions(task({ status: "done" }))).toMatchObject({
      queue: true,
      toDo: true,
      complete: false,
    });
  });
});


it("offers finish with findings only for capable hosts and canonical failures", () => {
  const failed = task({ status: "blocked", sessionId: "worker", stop: reviewStop("Defect"), verification: { review: { verdict: "fail", note: "Defect", sessionId: "reviewer" } } });
  expect(taskActions(failed).finishWithFindings).toBe(false);
  expect(taskActions(failed, ["tasks.finish-with-findings"]).finishWithFindings).toBe(true);
  expect(taskActions({ ...failed, stop: { ...reviewStop("Permission denied"), code: "permission_required", nextAction: "provide_input" } }, ["tasks.finish-with-findings"]).finishWithFindings).toBe(false);
});

it("preserves inherited versus explicit unlimited run limits", () => {
  expect(taskRunLimitForSave({ maxRunMinutes: 0, inheritMaxRunMinutes: true })).toBeUndefined();
  expect(taskRunLimitForSave({ maxRunMinutes: 0 })).toBe(0);
  expect(taskRunLimitForSave({ maxRunMinutes: 25 })).toBe(25);
});
