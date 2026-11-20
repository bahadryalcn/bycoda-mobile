import { expect, it } from "vitest";
import type { CrewRunView } from "@/remote/contracts/crews";
import { canAcceptCrewTask, canDeleteCrewRun, canFinishCrewRun, canStopCrewRun, crewActivityKnown, crewDirectoryPollInterval, crewHasRunningWork, crewInputDefinitelyRejected, crewRunPollInterval, crewTaskSessions } from "./runtime-model";
import { RemoteHostError } from "@/remote/host-error";

const run = (): CrewRunView => ({ id: "run", projectId: "project", status: "active", assignments: [{ taskId: "task" }],
  messages: [], tasks: [{ id: "task", status: "review", verification: { review: { verdict: "pass" } } }] } as unknown as CrewRunView);

it("removes redundant Stop for paused idle work while preserving cancellation for live and queued work", () => {
  const value = { ...run(), status: "paused", coordinatorStatus: "idle", tasks: [] } as CrewRunView;
  expect(canStopCrewRun(value)).toBe(false);
  expect(canDeleteCrewRun(value)).toBe(true);
  value.coordinatorStatus = "running";
  expect(crewHasRunningWork(value)).toBe(true);
  expect(canStopCrewRun(value)).toBe(true);
  expect(canDeleteCrewRun(value)).toBe(false);
  value.coordinatorStatus = "idle";
  for (const status of ["queued", "running", "verifying"] as const) {
    value.tasks = [{ status } as CrewRunView["tasks"][number]];
    expect(canStopCrewRun(value)).toBe(true);
    expect(canDeleteCrewRun(value)).toBe(false);
  }
  value.status = "finished";
  expect(canStopCrewRun(value)).toBe(false);
});

it("does not infer inactivity when an older host omits coordinator status", () => {
  const value = { ...run(), status: "paused", coordinatorSessionId: "lead", tasks: [] } as CrewRunView;
  expect(crewActivityKnown(value)).toBe(false);
  expect(canStopCrewRun(value)).toBe(true);
  expect(canDeleteCrewRun(value)).toBe(false);
});

it("opens the current reviewer instead of an earlier review and retains historical worker navigation", () => {
  const task = { status: "verifying", reviewer: { sessionId: "current" }, verification: { review: { sessionId: "previous" } },
    attemptHistory: [{ workerSessionId: "worker", reviewerSessionId: "historical" }] } as CrewRunView["tasks"][number];
  expect(crewTaskSessions(task)).toEqual({ worker: "worker", review: "current" });
});

it("only offers acceptance for assigned tasks with passing independent review and resolved directives", () => {
  const value = run();
  expect(canAcceptCrewTask(value, "task")).toBe(true);
  expect(canAcceptCrewTask(value, "foreign-task")).toBe(false);
  value.messages = [{ id: "request", from: "owner", text: "Fix this", createdAt: 1, taskId: "task" }];
  expect(canAcceptCrewTask(value, "task")).toBe(false);
  value.messages[0].resolvedAt = 2;
  expect(canAcceptCrewTask(value, "task")).toBe(true);
  value.tasks[0].verification!.review!.verdict = "fail";
  expect(canAcceptCrewTask(value, "task")).toBe(false);
  value.tasks[0].status = "done";
  expect(canAcceptCrewTask(value, "task")).toBe(false);
});

it("requires accepted tasks, resolved requests and complete integration dependencies before finish", () => {
  const value = run();
  expect(canFinishCrewRun(value)).toBe(false);
  value.tasks[0].status = "done";
  expect(canFinishCrewRun(value)).toBe(true);
  value.assignments.push({ taskId: "integration", integration: true } as CrewRunView["assignments"][number]);
  value.tasks.push({ id: "integration", status: "done", dependsOn: [] } as unknown as CrewRunView["tasks"][number]);
  expect(canFinishCrewRun(value)).toBe(false);
  value.tasks[1].dependsOn = ["task"];
  expect(canFinishCrewRun(value)).toBe(true);
  value.messages = [{ id: "question", text: "Question", from: "owner", createdAt: 1 }];
  expect(canFinishCrewRun(value)).toBe(false);
  value.messages[0].resolvedAt = 2;
  value.status = "finished";
  expect(canFinishCrewRun(value)).toBe(false);
});

it("does not offer source task completion without actual assignments", () => {
  expect(canFinishCrewRun({ ...run(), sourceTaskId: "source", assignments: [], tasks: [] })).toBe(false);
});

it("releases a pending input only after definite rejection, retaining uncertain delivery latches", () => {
  expect(crewInputDefinitelyRejected(new RemoteHostError("pc", "host", "Question changed"))).toBe(true);
  expect(crewInputDefinitelyRejected(new RemoteHostError("pc", "auth", "Denied"))).toBe(true);
  expect(crewInputDefinitelyRejected(new RemoteHostError("pc", "host", "Unknown receipt", true))).toBe(false);
  expect(crewInputDefinitelyRejected(new RemoteHostError("pc", "network", "Disconnected"))).toBe(false);
  expect(crewInputDefinitelyRejected(new Error("Unknown error"))).toBe(false);
});

it("polls a run fast only while it can change by itself and stops once it is finished", () => {
  const value = { ...run(), status: "paused", coordinatorStatus: "idle", tasks: [] } as CrewRunView;
  expect(crewRunPollInterval(value)).toBe(15_000);
  expect(crewRunPollInterval({ ...value, status: "active" })).toBe(5000);
  expect(crewRunPollInterval({ ...value, coordinatorStatus: "running" })).toBe(5000);
  expect(crewRunPollInterval({ ...value, tasks: [{ status: "queued" } as CrewRunView["tasks"][number]] })).toBe(5000);
  // Unknown activity (older host) is never treated as idle.
  expect(crewRunPollInterval({ ...value, coordinatorSessionId: "lead", coordinatorStatus: undefined })).toBe(5000);
  // A pending answer or approval keeps the expanded run responsive even when paused.
  expect(crewRunPollInterval({ ...value, pendingInputs: [{ taskId: "task" }] } as CrewRunView)).toBe(5000);
  expect(crewRunPollInterval({ ...value, status: "finished" })).toBe(false);
  expect(crewRunPollInterval({ ...value, status: "finished", coordinatorStatus: "running" })).toBe(5000);
  expect(crewRunPollInterval(undefined)).toBe(5000);
});

it("polls the crew directory only for the Work list and slows down when nothing is live", () => {
  const idle = { ...run(), status: "finished", coordinatorStatus: "idle", tasks: [] } as CrewRunView;
  const live = { ...idle, id: "live", status: "active" } as CrewRunView;
  expect(crewDirectoryPollInterval({ runs: [idle, live] }, true)).toBe(5000);
  expect(crewDirectoryPollInterval({ runs: [idle] }, true)).toBe(15_000);
  expect(crewDirectoryPollInterval({ runs: [] }, true)).toBe(15_000);
  // Definitions, member library and an open editor pass runsVisible=false: no polling even with live runs.
  expect(crewDirectoryPollInterval({ runs: [live] }, false)).toBe(false);
  expect(crewDirectoryPollInterval(undefined, false)).toBe(false);
});
