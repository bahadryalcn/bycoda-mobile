import { expect, it } from "vitest";
import type { Block } from "@/domain/types";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import { activityBarLabel, activityStateLabel, agentCountText, countAgents, deriveSessionActivity, sessionAgentEntries } from "./session-activity-model";

const copy = (_tr: string, en: string, v?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (_, k) => String(v?.[k]));
const user = { id: "u", role: "user", text: "go", startedAt: 1000 } as Block;
const agent = (id: string, status: string): Block => ({ id, role: "tool", text: "", tool: { status }, agentRun: { name: id } } as Block);
const child = (sessionId: string, state: ChildSessionEntry["state"]): ChildSessionEntry =>
  ({ sessionId, projectId: "p", title: sessionId, kind: "subagent", state, startedAt: 1, meta: "" });
const label = (a: ReturnType<typeof deriveSessionActivity>) => activityStateLabel(a, copy);

it("is idle with nothing to say and working while the agent runs", () => {
  expect(deriveSessionActivity({ blocks: [user], live: false }).state).toBe("idle");
  const working = deriveSessionActivity({ blocks: [user], live: true });
  expect(working).toMatchObject({ state: "working", startedAt: 1000 });
  expect(label(working)).toBe("Working");
});

it("waits on agents the agent yielded to, and runs in the background when only commands remain", () => {
  const waiting = deriveSessionActivity({ blocks: [user, agent("a", "running"), agent("b", "running")], live: true, backgroundTasks: ["a", "b"], backgroundAgents: 2 });
  expect(waiting.state).toBe("waiting");
  expect(label(waiting)).toBe("Waiting for 2 agents");
  expect(label(deriveSessionActivity({ blocks: [user], live: true, backgroundTasks: ["dev server"] }))).toBe("Waiting for 1 background task");
  const background = deriveSessionActivity({ blocks: [user], live: true, backgroundTasks: ["dev server"], backgroundAgents: 0 });
  expect(label(background)).toBe("Running in background");
});

it("needs the user for a question or an undecided approval, ahead of waiting", () => {
  expect(deriveSessionActivity({ blocks: [user], live: true, pendingQuestion: true, backgroundTasks: ["x"] }).state).toBe("needs-input");
  const approval = { id: "t", role: "tool", text: "", approval: { requestId: 1 } } as Block;
  expect(deriveSessionActivity({ blocks: [user, approval], live: true }).state).toBe("needs-input");
  expect(deriveSessionActivity({ blocks: [user, { ...approval, approval: { requestId: 1, decided: "allow" } }], live: true }).state).toBe("working");
});

it("keeps running in the background after the run when child sessions work, then shows Done once", () => {
  expect(deriveSessionActivity({ blocks: [user], live: false, children: [child("c", "running")] }).state).toBe("background");
  expect(deriveSessionActivity({ blocks: [user], live: false, justFinished: true }).state).toBe("done");
  expect(deriveSessionActivity({ blocks: [user], live: false, justFinished: true }).startedAt).toBeUndefined();
});

it("counts every agent once: blocks across turns plus child sessions, child winning over its block", () => {
  const blocks = [agent("old", "completed"), user, agent("new", "running"), agent("delegated:c1", "running"), agent("gone", "failed")];
  const counts = countAgents(blocks, [child("c1", "completed"), child("c2", "running")], true);
  expect(counts).toEqual({ total: 5, queued: 0, running: 2, done: 2, failed: 1, stopped: 0, interrupted: 0 });
  expect(agentCountText(counts, copy)).toBe("2 running · 2 done · 1 failed");
  expect(agentCountText(counts, copy, true)).toBe("2 agents running, 2 finished, 1 failed");
  expect(agentCountText({ ...counts, running: 1, done: 0, failed: 0 }, copy, true)).toBe("1 agent running");
});

it("does not call an unfinished call running once the run is over", () => {
  expect(countAgents([agent("a", "running")], [], false)).toMatchObject({ running: 0, interrupted: 1, done: 0 });
});

it("presents finished-parent rows with the same interrupted state as their counts", () => {
  const blocks = [agent("active", "running"), agent("delegated:child", "running"), agent("done", "completed")];
  const children = [child("child", "running")];
  expect(sessionAgentEntries(blocks, children, false).map(({ id, state }) => [id, state])).toEqual([
    ["done", "completed"], ["active", "interrupted"],
  ]);
  expect(sessionAgentEntries(blocks, children, true).find(({ id }) => id === "active")?.state).toBe("running");
  expect(countAgents(blocks, children, false)).toMatchObject({ total: 3, done: 1, interrupted: 1, running: 1 });
});

it("rejects an invalid start time", () => {
  expect(deriveSessionActivity({ blocks: [{ ...user, startedAt: NaN }], live: true }).startedAt).toBeUndefined();
});

it("leaves plain working to the transcript but keeps waiting, needs-input and done in the bar", () => {
  const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(p\d+)\}/g, (_: string, key: string) => String(values?.[key]));
  const base = { counts: { total: 0, queued: 0, running: 0, done: 0, failed: 0, stopped: 0, interrupted: 0 }, waitingOn: { agents: 0, tasks: 0 } };
  expect(activityBarLabel({ ...base, state: "working" }, copy)).toBe("");
  expect(activityBarLabel({ ...base, state: "needs-input" }, copy)).toBe("Needs you");
  expect(activityBarLabel({ ...base, state: "waiting", waitingOn: { agents: 1, tasks: 0 } }, copy)).toBe("Waiting for 1 agent");
  expect(activityBarLabel({ ...base, state: "done" }, copy)).toBe("Done");
});

it("counts an older turn's unfinished run as interrupted while a later turn works", () => {
  const blocks = [
    { id: "u1", role: "user", text: "first" } as Block, agent("old", "running"),
    { id: "u2", role: "user", text: "second" } as Block, agent("now", "running"),
  ];
  expect(sessionAgentEntries(blocks, [], true).map((entry) => [entry.id, entry.state])).toEqual([["now", "running"], ["old", "interrupted"]]);
  expect(countAgents(blocks, [], true)).toMatchObject({ running: 1, interrupted: 1 });
  // Without an owner turn in the page every run is the latest turn's.
  expect(countAgents([agent("solo", "running")], [], true).running).toBe(1);
});
