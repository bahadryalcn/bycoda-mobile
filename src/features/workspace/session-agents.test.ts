import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

type Call = { key: unknown[]; method: string; params: unknown; enabled?: boolean; interval?: unknown };
const state = vi.hoisted(() => ({ calls: [] as Call[], capabilities: [] as string[], devices: undefined as unknown }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ capabilities: state.capabilities }) }));
vi.mock("@/state/queries", () => ({
  useHostClient: () => ({}),
  useHostQuery: (key: unknown[], method: string, params: unknown, options: { enabled?: boolean; interval?: unknown }) => {
    state.calls.push({ key, method, params, enabled: options.enabled, interval: options.interval });
    return { data: method === "devices.list" ? state.devices : undefined };
  },
}));
vi.mock("./subagent-sessions-model", () => ({ childSessions: () => [] }));
vi.mock("./agents-sheet", () => ({ AgentsSheet: () => null }));
vi.mock("./session-browser", () => ({ SessionBrowser: () => null }));
vi.mock("./session-device-sheet", () => ({ SessionDeviceSheet: () => null }));
vi.mock("./session-activity-bar", () => ({
  SessionActivityBar: (props: { activity: { state: string; counts: { total: number } }; device?: { name?: string }; browser?: { host?: string } }) =>
    createElement("p", null, [props.activity.state, props.activity.counts.total, props.device ? `device:${props.device.name ?? "?"}` : "", props.browser ? `browser:${props.browser.host ?? "?"}` : ""].join("|")),
}));
import { SessionAgents } from "./session-agents";

const session = (blocks: unknown[], status = "idle", extra: object = {}) =>
  ({ projectId: "p", status, runId: "r", session: { blocks, cwd: "/", harness: "codex", ...extra } }) as never;
const props = { scope: { machineId: "m", sessionId: "s" }, disabled: false, onCommand: () => {} } as never;
const render = (s: unknown) => renderToStaticMarkup(createElement(SessionAgents, { ...(props as object), session: s, children: (bar: unknown) => createElement("section", null, bar as never) } as never));
beforeEach(() => Object.assign(state, { calls: [], capabilities: [], devices: undefined }));

it("virtualizes delegated session rows and announces their section label only once", () => {
  const source = readFileSync(new URL("./agents-sheet.tsx", import.meta.url), "utf8");
  expect(source.match(/Runs on its own/g)).toHaveLength(1);
  expect(source).toMatch(/children\.map\(\(child\): ListItem => \(\{ kind: "child"/);
  expect(source).toMatch(/<FlatList data=\{items\}/);
  expect(source).toMatch(/item\.kind === "child"\) return <ChildRow/);
});

it("reads only this session's children, never the whole project list, and only when it used subagents or runs", () => {
  render(session([{ id: "a", role: "assistant", text: "hi" }]));
  expect(state.calls[0]).toMatchObject({ key: ["sessions", "p", "children", "s"], params: { projectId: "p", parentSessionId: "s" }, enabled: false });
  render(session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }]));
  expect(state.calls.find((c, i) => i >= 3 && c.method === "sessions.list")!.enabled).toBe(true);
  state.calls = [];
  render(session([], "running"));
  expect(state.calls[0]!.enabled).toBe(true);
  expect(state.calls.every((c) => c.method !== "sessions.list" || (c.params as { parentSessionId?: string }).parentSessionId === "s")).toBe(true);
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
  expect(interval(undefined)).toBe(4000);
  expect(interval([{ id: "c", delegationParent: { parentSessionId: "s" } }])).toBe(4000);
  expect(interval([{ id: "c", delegationParent: { parentSessionId: "s" } }, { id: "other" }])).toBe(15_000);
});

it("hands the activity strip to the composer's operating controls", () => {
  expect(render(session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }]))).toBe("<section><p>idle|1||</p></section>");
});

it("polls holders only while running and only on Hosts that report them", () => {
  render(session([], "running"));
  expect(state.calls.filter((c) => c.method !== "sessions.list").every((c) => c.enabled === false)).toBe(true);
  state.calls = []; state.capabilities = ["devices.holder.v1", "browser.holder.v1"];
  render(session([], "running"));
  expect(state.calls.filter((c) => c.method !== "sessions.list").map((c) => c.enabled)).toEqual([true, true]);
  state.calls = [];
  render(session([], "idle"));
  expect(state.calls.filter((c) => c.method !== "sessions.list").map((c) => c.enabled)).toEqual([false, false]);
});

it("shows the device this session holds by its list name", () => {
  state.capabilities = ["devices.holder.v1"];
  state.devices = { devices: [{ id: "d1", name: "Pixel 9 Pro", platform: "android", heldBy: { kind: "session", sessionId: "s" } }], errors: [] };
  expect(render(session([], "running"))).toContain("device:Pixel 9 Pro");
});

it("infers the browser from the transcript on an older Host", () => {
  const blocks = [{ id: "u", role: "user", text: "go" }, { id: "t", role: "tool", text: "", tool: { title: "preview_open", detail: "http://localhost:5173/", status: "completed" } }];
  expect(render(session(blocks, "running"))).toContain("browser:localhost:5173");
});
