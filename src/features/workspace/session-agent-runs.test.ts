import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

type Call = { key: unknown[]; method: string; params: unknown; enabled?: boolean; interval?: unknown };
const state = vi.hoisted(() => ({ calls: [] as Call[], rows: undefined as unknown, error: undefined as unknown }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/queries", () => ({
  useHostClient: () => ({}),
  useHostQuery: (key: unknown[], method: string, params: unknown, options: { enabled?: boolean; interval?: unknown }) => {
    state.calls.push({ key, method, params, enabled: options.enabled, interval: options.interval });
    return { data: state.rows, error: state.error };
  },
}));
vi.mock("./agents-sheet", () => ({ AgentsSheet: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
import { SessionAgentRunsProvider, useSessionAgentRuns } from "./session-agent-runs";

const session = (blocks: unknown[], status = "idle") =>
  ({ projectId: "p", status, runId: "r", session: { blocks, cwd: "/", harness: "codex" } }) as never;
const props = { scope: { machineId: "m", sessionId: "s" }, disabled: false, onCommand: () => {} } as never;
function Probe() {
  const runs = useSessionAgentRuns();
  return createElement("p", null, runs ? runs.children.map((child) => child.sessionId).join(",") || "none" : "missing");
}
const render = (s: unknown) => renderToStaticMarkup(createElement(SessionAgentRunsProvider, { ...(props as object), session: s } as never, createElement(Probe)));
const child = { id: "c", projectId: "p", title: "Child", harness: "claude", revision: 1, status: "idle", updatedAt: 1,
  delegationParent: { parentSessionId: "s", runId: "r", kind: "subagent", model: "claude:opus", startedAt: 1 } };
beforeEach(() => Object.assign(state, { calls: [], rows: undefined, error: undefined }));

it("virtualizes delegated session rows under one clearly named section", () => {
  const source = readFileSync(new URL("./agents-sheet.tsx", import.meta.url), "utf8");
  expect(source.match(/Separate sessions/g)).toHaveLength(1);
  expect(source).not.toContain("Runs on its own");
  expect(source).toMatch(/childRows\.map\(\(child\): ListItem => \(\{ kind: "child"/);
  expect(source).toMatch(/<FlatList data=\{items\}/);
  expect(source).toMatch(/item\.kind === "child"\) return <View style=\{divider\}><SubagentRunRow view=\{childRunView/);
});

it("reads only this session's children, never the whole project list, and only when it used subagents or runs", () => {
  render(session([{ id: "a", role: "assistant", text: "hi" }]));
  expect(state.calls[0]).toMatchObject({ key: ["sessions", "p", "children", "s"], params: { projectId: "p", parentSessionId: "s" }, enabled: false });
  state.calls = [];
  render(session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }]));
  expect(state.calls[0]!.enabled).toBe(true);
  state.calls = [];
  render(session([], "running"));
  expect(state.calls[0]!.enabled).toBe(true);
  expect(state.calls.every((c) => (c.params as { parentSessionId?: string }).parentSessionId === "s")).toBe(true);
  // A finished session that delegated keeps only the delegate's result turn; reopening must still read its children.
  state.calls = [];
  render(session([{ id: "d", role: "user", text: "result", author: { kind: "delegation" } }]));
  expect(state.calls[0]!.enabled).toBe(true);
});

it("polls the child read only while the session runs, and slows it when the Host ignored the parent filter", () => {
  render(session([], "idle"));
  expect(state.calls[0]!.interval).toBeUndefined();
  state.calls = [];
  render(session([], "running"));
  const interval = state.calls[0]!.interval as (rows: unknown) => number;
  // No agents or delegation in the transcript yet: discovery polls slowly until a child appears.
  expect(interval(undefined)).toBe(15_000);
  expect(interval([{ id: "c", delegationParent: { parentSessionId: "s" } }])).toBe(4000);
  expect(interval([{ id: "c", delegationParent: { parentSessionId: "s" } }, { id: "other" }])).toBe(15_000);
});

it("keeps polling an idle parent's children while one of them still runs", () => {
  state.rows = [{ ...child, status: "running" }];
  render(session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }], "idle"));
  // The first render learns a child runs; the next one polls.
  expect(state.calls.at(-1)!.interval).toBeTypeOf("function");
  state.calls = [];
  state.rows = [child];
  render(session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }], "idle"));
  expect(state.calls.at(-1)!.interval).toBeUndefined();
});

it("reads children for an advisor consult, whose only trace is the consult call", () => {
  render(session([{ id: "c", role: "tool", text: "agents.consult", tool: { title: "agents.consult", status: "completed" } }]));
  expect(state.calls[0]!.enabled).toBe(true);
});

it("shares one read with the transcript and the composer strip, and hides it after an access failure", () => {
  state.rows = [child];
  expect(render(session([], "running"))).toBe("<p>c</p>");
  expect(state.calls).toHaveLength(1);
  state.error = { kind: "auth" };
  expect(render(session([], "running"))).toBe("<p>none</p>");
  expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>missing</p>");
});
