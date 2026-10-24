import { expect, it, vi } from "vitest";
import { createWorkApi } from "./work-api";
import { readonlyRequest } from "../request-policy";
import type { HostRequest } from "../types";

it("previews only the schedule, updates settings with a conflict token and declines exactly one task", async () => {
  const request = vi.fn(async () => ({}));
  const api = createWorkApi(request as HostRequest);
  const schedule = { scheduleKind: "daily" as const, time: "09:00", minute: 0, dayOfWeek: 1 };
  const settings = { autoMerge: false, continueUntilDone: true, maxRunningTasks: 0, maxRunMinutes: 30 };
  await api.automations.preview(schedule);
  await api.goals.update("goal", settings, 123);
  await api.stewards.decline("proposal");
  expect(request.mock.calls).toEqual([
    ["automations.preview", { schedule }, undefined],
    ["goals.update", { goalId: "goal", settings, expectedUpdatedAt: 123 }, undefined],
    ["stewards.decline", { taskId: "proposal" }, undefined],
  ]);
  expect(readonlyRequest("automations.preview", { schedule })).toBe(true);
  expect(readonlyRequest("goals.update", {})).toBe(false);
  expect(readonlyRequest("stewards.decline", {})).toBe(false);
});
