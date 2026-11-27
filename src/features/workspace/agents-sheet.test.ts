// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
import type { Block } from "@/domain/types";
import { AgentsSheet } from "./agents-sheet";

const fixture = vi.hoisted(() => ({ epoch: 1, push: vi.fn(), childTap: undefined as (() => void) | undefined, capabilities: [] as string[],
  clockActive: false, fullBlocks: {} as Record<string, unknown> }));
vi.mock("@/state/machines", () => ({ useMachines: (select: (state: unknown) => unknown) => select({ machines: [{ id: "computer", capabilities: fixture.capabilities }] }) }));
vi.mock("./subagent-run-row", () => ({
  SubagentRunRow: ({ view, onPress, action }: { view: { name: string; state: string; harness?: string }; onPress: () => void; action?: ReactNode }) => {
    if (view.name.startsWith("Child session")) fixture.childTap = onPress;
    return h("div", null, h("button", { "aria-label": `${view.name}. ${view.state}. ${view.harness ?? ""}`, onClick: onPress }, view.name), action);
  },
}));
vi.mock("expo-router", () => ({ router: { push: fixture.push } }));
vi.mock("@/state/connection-scope", async () => {
  const { useMemo } = await import("react");
  return { useConnectionScope: () => {
    const epoch = fixture.epoch;
    return useMemo(() => ({ review: { id: "computer" }, isCurrent: () => epoch === fixture.epoch }), [epoch]);
  } };
});
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => h("div", null, children),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: {
    data: { id: string }[]; renderItem: (entry: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode; ListEmptyComponent?: ReactNode;
  }) => h("div", null, ListHeaderComponent, data.length ? data.map((item) => h("div", { key: item.id }, renderItem({ item }))) : ListEmptyComponent),
}));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("@/ui/agent-avatar", () => ({ AgentAvatar: () => null }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: { children?: ReactNode }) => h("p", null, children) }));
vi.mock("@/ui/feedback", () => ({ Badge: ({ label }: { label: string }) => h("span", null, label), StatusText: ({ label }: { label: string }) => h("span", null, label) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/chat-controls", () => ({ ChatToolbarAction: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label) }));
vi.mock("@/ui/primitives", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { "aria-label": label, onClick: onPress }, label),
  Sheet: ({ title, headerAction, children }: { title: string; headerAction?: ReactNode; children?: ReactNode }) => h("section", null, h("h1", null, title), headerAction, children),
  NavigationRow: ({ label, accessibilityLabel, detail, metadata, trailing, onPress }: { label: string; accessibilityLabel?: string; detail?: string; metadata?: string; trailing?: ReactNode; onPress: () => void }) => {
    const spoken = accessibilityLabel ?? label;
    if (spoken.startsWith("Child session")) fixture.childTap = onPress;
    return h("button", { "aria-label": spoken, onClick: onPress }, label, detail, metadata, trailing);
  },
  Empty: ({ title }: { title: string }) => h("p", null, title),
  StateView: ({ title }: { title: string }) => h("p", null, title),
  SectionHeader: ({ title }: { title: string }) => h("h2", null, title),
  QueryState: ({ query }: { query: QueryLike }) => h("p", null, getQueryPresentation(query)),
}));
vi.mock("./subagent-details", () => ({ SubagentDetails: ({ block, requestStop }: { block: Block; requestStop?: boolean }) => h("p", null, block.agentRun?.prompt, requestStop ? " [stop review]" : "") }));
vi.mock("./use-elapsed-now", () => ({ useElapsedNow: (active: boolean) => { fixture.clockActive = active; return 0; } }));
vi.mock("./session-queries", () => ({
  useSessionBlock: ({ blockId, enabled }: { blockId: string; enabled: boolean }) =>
    ({ data: enabled ? fixture.fullBlocks[blockId] : undefined, status: enabled && !fixture.fullBlocks[blockId] ? "pending" : "success", fetchStatus: "idle" }),
}));

const agent: Block = { id: "agent", role: "tool", text: "Agent", agentRun: { name: "Research agent", prompt: "Current assignment", steps: [] } };
const child = { sessionId: "child", projectId: "project", title: "Child session", kind: "subagent" as const, state: "completed" as const, startedAt: 1, meta: "" };
const onClose = vi.fn();
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const render = (props: Partial<Parameters<typeof AgentsSheet>[0]> = {}) => act(async () => root.render(h(AgentsSheet, {
  blocks: [], onClose, scope: { machineId: "computer", sessionId: "parent" }, disabled: false, onCommand: vi.fn(), ...props,
})));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.epoch = 1;
  fixture.childTap = undefined;
  fixture.capabilities = [];
  fixture.clockActive = false;
  fixture.fullBlocks = {};
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("keeps the selected subagent when the refreshed block temporarily lacks its agent record", async () => {
  await render({ blocks: [agent] });
  await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label^='Research agent']")!.click());
  expect(container.textContent).toContain("Current assignment");
  await render({ blocks: [{ ...agent, agentRun: undefined }] });
  expect(container.textContent).toContain("Action unavailable");
  expect(container.textContent).not.toContain("No subagents");
  await render({ blocks: [agent] });
  expect(container.textContent).toContain("Current assignment");
});

it("distinguishes empty child results from loading and offline", async () => {
  await render({ childrenQuery: { status: "pending", fetchStatus: "fetching" } });
  expect(container.textContent).toContain("loading");
  expect(container.textContent).not.toContain("No subagents");
  await render({ childrenQuery: { status: "pending", fetchStatus: "paused" } });
  expect(container.textContent).toContain("paused");
  await render({ childrenQuery: { status: "success", data: [] } });
  expect(container.textContent).toContain("No subagents");
});

it("keeps internal agent records out of the list and its counts", async () => {
  await render({ blocks: [{ ...agent, internal: true }] });
  expect(container.textContent).not.toContain("Research agent");
  expect(container.textContent).toContain("No subagents");
});

it("rejects an old child action after a re-pair and routes a current double tap once", async () => {
  await render({ childRuns: [child] });
  const old = fixture.childTap!;
  fixture.epoch++;
  await act(async () => old());
  expect(fixture.push).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await render({ childRuns: [child] });
  await act(async () => { fixture.childTap!(); fixture.childTap!(); });
  expect(onClose).toHaveBeenCalledOnce();
  expect(fixture.push).toHaveBeenCalledExactlyOnceWith({ pathname: "/session/[id]", params: { id: "child", machineId: "computer", projectId: "project" } });
});

it("names the separate-session section clearly and draws each run with its own provider", async () => {
  await render({ blocks: [{ ...agent, agentRun: { ...agent.agentRun!, model: "gpt-5" } }], childRuns: [{ ...child, harness: "claude" }], parentProvider: "claude" });
  expect(container.textContent).toContain("Separate sessions");
  expect(container.textContent).not.toContain("Runs on its own");
  expect(container.querySelector("button[aria-label^='Research agent']")!.getAttribute("aria-label")).toContain("codex");
  expect(container.querySelector("button[aria-label^='Child session']")!.getAttribute("aria-label")).toContain("claude");
});

it("offers Stop only for a stoppable running run, and opens its details at the stop review", async () => {
  const running: Block = { ...agent, tool: { status: "running", callId: "call" }, agentRun: { ...agent.agentRun!, startedAt: 1 } };
  await render({ blocks: [running], live: true, runId: "run", parentProvider: "claude" });
  expect(container.querySelector("button[aria-label='Stop']")).toBeNull();
  fixture.capabilities = ["sessions.stopItem.claude"];
  await render({ blocks: [running], live: true, runId: "run", parentProvider: "codex" });
  expect(container.querySelector("button[aria-label='Stop']")).toBeNull();
  await render({ blocks: [running], live: true, runId: "run", parentProvider: "claude" });
  await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label='Stop']")!.click());
  expect(container.textContent).toContain("Current assignment [stop review]");
  // Back to the list clears the request; opening the row again shows plain details.
  await act(async () => container.querySelector<HTMLButtonElement>("h1 + button")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label^='Research agent']")!.click());
  expect(container.textContent).toContain("Current assignment");
  expect(container.textContent).not.toContain("[stop review]");
});

it("keeps the clock running for a working child session when no inline run works", async () => {
  await render({ childRuns: [{ ...child, state: "running" }] });
  expect(fixture.clockActive).toBe(true);
  await render({ childRuns: [child] });
  expect(fixture.clockActive).toBe(false);
});

it("settles an older turn's unfinished run while a later turn works, like the transcript", async () => {
  const stale: Block = { ...agent, id: "old", tool: { status: "running", callId: "c1" }, agentRun: { ...agent.agentRun!, name: "Old agent" } };
  const current: Block = { ...agent, id: "new", tool: { status: "running", callId: "c2" }, agentRun: { ...agent.agentRun!, name: "New agent" } };
  await render({ live: true, blocks: [{ id: "u1", role: "user", text: "first" }, stale, { id: "u2", role: "user", text: "second" }, current] });
  expect(container.querySelector("button[aria-label^='Old agent']")!.getAttribute("aria-label")).toContain("interrupted");
  expect(container.querySelector("button[aria-label^='New agent']")!.getAttribute("aria-label")).toContain("running");
  // The tally counts the old run as interrupted, not running (the test copy leaves `{p0}` in place).
  expect(container.textContent).toContain("{p0} running · {p0} interrupted");
  expect(container.textContent?.indexOf("Old agent")).toBeGreaterThan(container.textContent!.indexOf("Finished"));
});

it("reads a run's full block before its details when the Host sent it without content", async () => {
  const shrunk: Block = { ...agent, agentRun: { name: "Research agent", steps: [] }, remoteContent: { revision: 1, bytes: 9, digest: "d" } } as Block;
  await render({ blocks: [shrunk] });
  await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label^='Research agent']")!.click());
  expect(container.textContent).not.toContain("Current assignment");
  fixture.fullBlocks = { agent };
  await render({ blocks: [shrunk] });
  expect(container.textContent).toContain("Current assignment");
});
