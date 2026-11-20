import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { agentCounts, groupAgents, listAgents } from "./agents-model";

const agent = (id: string, status: string, extra: Partial<Block> = {}) =>
  ({ id, role: "tool", text: id, tool: { callId: id, status, ...(extra.tool ?? {}) }, agentRun: { name: id, agentType: "explorer", model: "codex:gpt-5", startedAt: 1,
    steps: [{ id: "a", kind: "tool", text: "Read  file", status: "running" }] } }) as Block;

describe("agents list", () => {
  it("lists every subagent newest first with state, meta and summary", () => {
    const list = listAgents([agent("a", "completed", { tool: { callId: "a", status: "completed", detail: "All\n done" } } as Partial<Block>), { id: "x", role: "assistant", text: "hi" } as Block, agent("b", "running")]);
    expect(list.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(list[0]).toMatchObject({ state: "running", meta: "explorer · gpt-5", summary: "Read file" });
    expect(list[1]).toMatchObject({ state: "completed", summary: "All done" });
    expect(agentCounts(list)).toEqual({ total: 2, running: 1 });
  });
  it("is empty without blocks", () => expect(listAgents(undefined)).toEqual([]));
  it("groups workflow calls and phases separately while retaining standalone status groups", () => {
    const child = (id: string, callId: string, phase?: string) => {
      const block = agent(id, "running");
      return { ...block, agentRun: { ...block.agentRun!, workflow: { callId, phase } } };
    };
    const entries = listAgents([agent("done", "completed"), agent("active", "running"), child("a", "call-a", "review"), child("b", "call-a", "plan"), child("c", "call-b", "review")]);
    const items = groupAgents(entries, "Running", "Finished");
    expect(items.map((item) => item.kind === "heading" ? item.label : item.id)).toEqual([
      "Running", "active", "Finished", "done", "Workflow 1 · review", "c", "Workflow 2 · plan", "b", "Workflow 2 · review", "a",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});
