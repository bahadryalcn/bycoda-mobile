import { expect, it } from "vitest";
import { catalogs, translate, type Locale } from "@/localization";
import { taskBulkUnavailable } from "../../../../../src/features/tasks/model/taskBulkActions";
import type { BoardTask } from "../../../../../src/features/tasks/model/taskClient";
import { taskBulkReason } from "./bulk-feedback";

const task = { id: "one", projectId: "project", machineId: "machine", title: "Task", prompt: "Instructions", status: "todo" } as BoardTask;
const reasons = [
  taskBulkUnavailable({ ...task, stale: true }, "start"),
  taskBulkUnavailable({ ...task, crewRunId: "crew" }, "start"),
  taskBulkUnavailable({ ...task, status: "running" }, "delete"),
  taskBulkUnavailable({ ...task, branch: "unmerged", merged: false }, "delete"),
  taskBulkUnavailable(task, "stop"),
  taskBulkUnavailable({ ...task, status: "blocked" }, "start"),
  taskBulkUnavailable(task, "retry"),
  taskBulkUnavailable({ ...task, prompt: "" }, "start"),
];

it.each(Object.keys(catalogs) as Locale[])("renders all local eligibility reasons in %s while retaining raw results", locale => {
  expect(new Set(reasons).size).toBe(8);
  for (const reason of reasons) {
    expect(reason).toBeTypeOf("string");
    const result = Object.freeze({ status: "skipped" as const, reason });
    const visible = taskBulkReason(result, (tr, en) => translate(locale, tr, en));
    expect(visible).toBe(catalogs[locale][reason!]);
    if (locale !== "en") expect(visible).not.toBe(reason);
    expect(result.reason).toBe(reason);
  }
});

it.each([
  { status: "failed" as const, reason: "Only tasks in To do can be started." },
  { status: "failed" as const, reason: "Host: /private/project — network timeout 🔒" },
  { status: "skipped" as const, reason: "A future policy reason from the shared owner." },
  { status: "skipped" as const, reason: undefined },
])("preserves unrecognized or failed result text: $reason", result => {
  expect(taskBulkReason(result, () => "must not replace this result")).toBe(result.reason);
});
