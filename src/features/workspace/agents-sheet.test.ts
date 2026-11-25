// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
import type { Block } from "@/domain/types";
import { AgentsSheet } from "./agents-sheet";

const fixture = vi.hoisted(() => ({ epoch: 1, push: vi.fn(), childTap: undefined as (() => void) | undefined }));
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
vi.mock("./subagent-details", () => ({ SubagentDetails: ({ block }: { block: Block }) => h("p", null, block.agentRun?.prompt) }));
vi.mock("./use-elapsed-now", () => ({ useElapsedNow: () => 0 }));

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
