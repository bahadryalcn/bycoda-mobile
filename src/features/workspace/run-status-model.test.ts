import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { currentTurn, formatElapsed, hasRunStatus, runStatus } from "./run-status-model";

const user = { id: "u", role: "user", text: "go" } as Block;
const agent = (id: string, status: string, extra: Partial<Block> = {}) =>
  ({ id, role: "tool", text: id, tool: { callId: id, status }, agentRun: { name: id, startedAt: 1000, steps: [
    { id: "a", kind: "tool", text: "Read file", status: "completed" }, { id: "b", kind: "tool", text: "Edit file", status: "running" }] }, ...extra }) as Block;
const tool = (id: string, status: string) => ({ id, role: "tool", text: id, tool: { callId: id, status, kind: "execute" } }) as Block;

describe("run status", () => {
  it("is empty when the session is idle", () => {
    expect(hasRunStatus(runStatus([user, agent("x", "running")], false))).toBe(false);
  });
  it("counts running subagents and tools and reads the current step", () => {
    const status = runStatus([user, agent("s1", "running"), agent("s2", "completed"), agent("s3", "failed"), tool("t1", "running"), tool("t2", "completed")], true);
    expect(status.subagents).toEqual({ total: 3, running: 1, done: 1, failed: 1 });
    expect(status.tools).toBe(1);
    expect(status.running.map((item) => item.id)).toEqual(["s1", "t1"]);
    expect(status.running[0]).toMatchObject({ kind: "subagent", detail: "Edit file", startedAt: 1000 });
    expect(status.startedAt).toBe(1000);
  });
  it("counts undecided approvals as waiting, not running", () => {
    const status = runStatus([user, agent("s1", "running", { approval: { requestId: 1 } })], true);
    expect(status.subagents.running).toBe(0);
    expect(status.waiting).toBe(1);
  });
  it("ignores blocks of earlier turns", () => {
    const blocks = [agent("old", "running"), user, tool("t", "running")];
    expect(currentTurn(blocks)).toHaveLength(1);
    expect(runStatus(blocks, true).subagents.total).toBe(0);
  });
  it("formats elapsed time", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
