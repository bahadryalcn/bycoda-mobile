import { expect, it } from "vitest";
import type { CrewRunView } from "@/remote/contracts/crews";
import { canAcceptCrewTask, canFinishCrewRun, crewInputDefinitelyRejected } from "./runtime-model";
import { RemoteHostError } from "@/remote/host-error";

const run = (): CrewRunView => ({ id: "run", projectId: "project", status: "active", assignments: [{ taskId: "task" }],
  messages: [], tasks: [{ id: "task", status: "review", verification: { review: { verdict: "pass" } } }] } as unknown as CrewRunView);

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
