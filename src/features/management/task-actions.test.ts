import { describe, expect, it } from "vitest";
import type { HostTask } from "@/domain/types";
import { taskActions, taskMatchesFilter } from "./task-actions";

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
describe("mobile task actions follow the host", () => {
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
          repairStop: { reason: "external", message: "Needs credentials" },
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
