import { expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { agentStateLabel, agentStateTone } from "./agent-state";
import { groupAgents, listAgents } from "./agents-model";
import { agentCountText, countAgents, sessionAgentEntries } from "./session-activity-model";
import { agentRunState } from "./transcript-model";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d+)\}/g, (_, key) => String(values?.[key]));
const colors = { info: "info", danger: "danger", warning: "warning", success: "success", muted: "muted" };
const agent = (id: string, status?: string, run: Partial<NonNullable<Block["agentRun"]>> = {}) =>
  ({ id, role: "tool", text: "", tool: status ? { status } : {}, agentRun: { name: id, ...run } }) as Block;

it("never reads unstarted, unknown or cancelled work as done", () => {
  expect(agentRunState(agent("a", "queued"))).toBe("queued");
  expect(agentRunState(agent("b", "pending"))).toBe("queued");
  expect(agentRunState(agent("c", "pending", { startedAt: 1 }))).toBe("running");
  expect(agentRunState(agent("d", "cancelled"))).toBe("cancelled");
  expect(agentRunState(agent("e", "denied"))).toBe("failed");
  expect(agentRunState(agent("f"))).toBe("neutral");
  expect(agentStateLabel("queued", copy)).toBe("Queued");
  expect(agentStateLabel("cancelled", copy)).toBe("Cancelled");
  expect(agentStateLabel("neutral", copy)).toBe("Unknown");
  expect(agentStateLabel("stopped", copy)).toBe("Stopped");
  expect(agentStateLabel("interrupted", copy)).toBe("Interrupted");
  expect(agentStateLabel("completed", copy)).toBe("Done");
  for (const state of ["queued", "cancelled", "neutral"] as const) expect(agentStateTone(state, colors)).toBe("muted");
});

it("counts queued agents apart from finished ones and keeps them in the active group", () => {
  const blocks = [agent("waiting", "queued"), agent("off", "cancelled"), agent("unknown"), agent("ok", "completed")];
  const counts = countAgents(blocks, [], true);
  expect(counts).toMatchObject({ total: 4, queued: 1, stopped: 1, done: 1, running: 0 });
  expect(agentCountText(counts, copy)).toBe("1 queued · 1 done · 1 stopped");
  const grouped = groupAgents(listAgents([agent("waiting", "queued"), agent("ok", "completed")]), "Running", "Finished");
  expect(grouped.map((item) => item.id)).toEqual(["h:running", "waiting", "h:finished", "ok"]);
});

it("treats queued work as interrupted once the parent run has ended", () => {
  expect(sessionAgentEntries([agent("waiting", "queued")], [], false)[0]?.state).toBe("interrupted");
  expect(sessionAgentEntries([agent("waiting", "queued")], [], true)[0]?.state).toBe("queued");
});
