import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { activeSubagent, subagentSteps, subagentStopCommand, subagentTarget } from "./subagent-model";
const scope = { machineId: "m", sessionId: "parent" };
const block = { id: "block", role: "tool", text: "Review", tool: { callId: "call", status: "running" },
  agentRun: { name: "Reviewer", steps: [] } } as Block;
describe("embedded subagent identity", () => {
  it("uses the parent session and exact block/call/run rather than inventing a child session", () => {
    const target = subagentTarget(scope, block, "run");
    expect(subagentStopCommand(target, scope, block, "run")).toEqual({ type: "stopItem", sessionId: "parent", runId: "run", blockId: "block", callId: "call" });
    for (const args of [
      [{ ...scope, machineId: "other" }, block, "run"], [scope, { ...block, id: "other" }, "run"],
      [scope, { ...block, tool: { ...block.tool, callId: "other" } }, "run"],
      [scope, block, "next"], [scope, { ...block, tool: { ...block.tool, status: "completed" } }, "run"],
    ] as const) expect(() => subagentStopCommand(target, args[0], args[1], args[2])).toThrow();
  });
  it("shows final report once and retains every other step and truncation signal", () => {
    const done = { ...block, tool: { ...block.tool, status: "completed", detail: "Final report" },
      agentRun: { name: "Reviewer", steps: [{ id: "read", kind: "tool" as const, text: "Read", outputTruncated: true },
        { id: "agent:report", kind: "message" as const, text: "Final report" }] } };
    expect(subagentSteps(done)).toMatchObject({ report: "Final report", steps: [{ id: "read", outputTruncated: true }] });
    expect(activeSubagent(done)).toBe(false);
    expect(activeSubagent({ ...block, agentRun: { ...block.agentRun!, endedAt: 123 } })).toBe(false);
    expect(subagentSteps(block).report).toBeUndefined();
  });
});
