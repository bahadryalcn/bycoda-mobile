// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HostAutomation, HostAutomationRun } from "@/domain/types";
import { AutomationCard } from "./automation-card";
import { savedAutomation, summarizedAutomationRun } from "./automation-feedback";
import type { AutomationCardProps } from "./types";

const query = vi.hoisted(() => ({ data: [] as HostAutomationRun[] | undefined, error: null as Error | null, isPending: false }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => query }));
const navigation = vi.hoisted(() => ({ current: true, push: vi.fn(), approvals: [] as Array<() => void>, details: [] as string[], mutate: vi.fn() }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => navigation.current }) }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer", name: "Review workstation" }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: { caption: {} } }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/power", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/history", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("@/ui/week-hours", () => ({ HoursOverview: () => null }));
vi.mock("../shared/record-bits", () => ({ RecordTrailing: ({ children }: PropsWithChildren) => createElement("div", null, children), useMenuGlyph: () => () => null, useRelativeTime: () => () => "soon", joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · ") }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, detail: string, _label: string, approve: () => void) => {
    navigation.details.push(detail);
    navigation.approvals.push(approve);
  },
}));
vi.mock("expo-router", () => ({ router: { navigate: navigation.push } }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({ title, status, metadata, children, footer, menu }: PropsWithChildren<{
    title: string; status: import("react").ReactNode; metadata: string; footer: import("react").ReactNode; menu: import("react").ReactNode;
  }>) => createElement("section", null, title, createElement("span", { "data-card-status": true }, status), metadata, children, footer, menu),
}));
vi.mock("../shared/format", () => ({ stamp: (value: number) => String(value) }));
vi.mock("../shared/status", () => ({ Status: ({ value }: { value: string }) => createElement("span", null, value) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label), Row: Wrapper, Stack: Wrapper, Separator: () => null,
    Sheet: Wrapper,
    ScreenList: ({ data, header, renderItem }: { data: HostAutomationRun[]; header: import("react").ReactNode; renderItem: (entry: { item: HostAutomationRun }) => import("react").ReactNode }) => createElement("div", null, header, data.map(item => createElement("div", { key: item.id }, renderItem({ item })))),
    ActionMenu: ({ actions }: { actions: Array<{ key: string; label: string; onPress: () => void } | false> }) =>
      actions.map(action => action && createElement("button", { key: action.key, onClick: action.onPress }, action.label)),
    IconButton: () => null, MutationState: () => null,
    ErrorNotice: ({ error }: { error?: string }) => error ? createElement("p", { role: "alert" }, error) : null,
    ErrorText: ({ error }: { error?: string }) => error ? createElement("p", { role: "alert" }, error) : null,
    QueryState: ({ query: result }: { query: typeof query }) => result.error
      ? createElement("p", { role: "alert" }, result.error.message)
      : result.isPending ? createElement("p", null, "Loading history") : null,
  };
});

const item: HostAutomation = {
  id: "automation", projectId: "project", name: "Review", prompt: "Review safely",
  harness: "codex", model: "model", modelSettings: {}, runtimeMode: "supervised",
  maxRunMinutes: 30, maxRunsPerDay: 2, enabled: true, scheduleKind: "daily", time: "09:00", minute: 0, dayOfWeek: 1,
  nextRunAt: 2000, createdAt: 100, updatedAt: 1000,
  lastRunAt: 1000, lastRunStatus: "failed", lastRunError: "Connection lost",
};
const latest: HostAutomationRun = {
  id: "latest", automationId: item.id, trigger: "scheduled", scheduledFor: 100,
  createdAt: 100, completedAt: 1000, status: "failed", error: item.lastRunError,
};

it("does not treat invalid or ambiguous saved automation rows as an absent record", () => {
  expect(savedAutomation([item], item.id)).toEqual(item);
  expect(savedAutomation([], item.id)).toBeUndefined();
  expect(() => savedAutomation([item, item], item.id)).toThrow();
  expect(() => savedAutomation([{ id: item.id }], item.id)).toThrow();
});

it("identifies only one exact completion already summarized by its automation", () => {
  expect(summarizedAutomationRun(item, [latest])).toBe(latest.id);
  for (const changed of [
    { ...latest, automationId: "other" }, { ...latest, completedAt: 999 },
    { ...latest, status: "succeeded" as const }, { ...latest, error: "Different error" },
    { ...latest, completedAt: undefined },
  ]) expect(summarizedAutomationRun(item, [changed])).toBeUndefined();
});

it("keeps legacy, missing, non-finite and ambiguous completion identities separate", () => {
  expect(summarizedAutomationRun(undefined, [latest])).toBeUndefined();
  for (const lastRunAt of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(summarizedAutomationRun({ ...item, lastRunAt }, [latest])).toBeUndefined();
  }
  expect(summarizedAutomationRun({ ...item, lastRunError: undefined }, [latest])).toBeUndefined();
  expect(summarizedAutomationRun(item, [latest, { ...latest, id: "another" }])).toBeUndefined();
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot> | undefined;
async function render(historyId: string | null = item.id, automation = item) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  const mutation = { isPending: false, variables: undefined, mutate: navigation.mutate };
  await act(async () => root!.render(createElement(AutomationCard, {
    item: automation, historyId, busy: false, editorOpen: false, onEdit: vi.fn(), onHistory: vi.fn(),
    save: mutation as unknown as AutomationCardProps["save"],
    run: mutation as unknown as AutomationCardProps["run"],
    remove: mutation as unknown as AutomationCardProps["remove"],
  })));
}
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  query.data = []; query.error = null; query.isPending = false; vi.unstubAllGlobals();
  navigation.current = true; navigation.push.mockClear(); navigation.approvals = []; navigation.mutate.mockClear();
  navigation.details = [];
});
const errors = () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent);
const click = (label: string) => act(async () => [...container.querySelectorAll("button")]
  .find(button => button.textContent === label)!.click());

it("shows a failed run on a paused automation while keeping its schedule state visible", async () => {
  await render(null, { ...item, enabled: false });
  expect(container.querySelector("[data-card-status]")?.textContent).toBe("failed");
  expect(container.textContent).toContain("Paused");
  await render(null, { ...item, enabled: false, lastRunStatus: "running", needsInput: true });
  expect(container.querySelector("[data-card-status]")?.textContent).toBe("needs-input");
  await render(null, { ...item, enabled: false, lastRunStatus: "succeeded", lastRunError: undefined });
  expect(container.querySelector("[data-card-status]")?.textContent).toBe("paused");
});

it.each(["Run now", "Delete"])("retires the reviewed %s action when the connection expires", async (label) => {
  await render(null);
  await click(label);
  expect(navigation.approvals).toHaveLength(1);
  expect(navigation.details[0]).toContain(`${item.name} · Review workstation`);
  navigation.current = false;
  await act(async () => navigation.approvals[0]!());
  expect(navigation.mutate).not.toHaveBeenCalled();
});

it("requires a fresh review after an automation updates and consumes only one approval", async () => {
  await render(null);
  await click("Run now");
  await render(null, { ...item, updatedAt: item.updatedAt + 1 });
  await act(async () => navigation.approvals[0]!());
  expect(navigation.mutate).not.toHaveBeenCalled();

  await click("Run now");
  const approve = navigation.approvals[1]!;
  await act(async () => { approve(); approve(); });
  expect(navigation.mutate).toHaveBeenCalledExactlyOnceWith({ automationId: item.id });
});

it("keeps every returned history record beyond the first twenty", async () => {
  query.data = Array.from({ length: 25 }, (_, index) => ({ ...latest, id: `run-${index}`, error: `run-tail-${index + 1}`, completedAt: index }));
  await render();
  expect(errors()).toContain("run-tail-25");
});

it("does not navigate a retained history session after its original connection expires", async () => {
  query.data = [{ ...latest, sessionId: "original-session" }]; await render();
  navigation.current = false;
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Open session")!.click());
  expect(navigation.push).not.toHaveBeenCalled();
});

it("keeps an available history session on the original computer and project", async () => {
  query.data = [{ ...latest, sessionId: "original-session" }]; await render();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Open session")!.click());
  expect(navigation.push).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "original-session", machineId: "computer", projectId: "project" } });
});

it("shows the latest error once while retaining the same error on an older run", async () => {
  query.data = [latest, { ...latest, id: "older", completedAt: 500 }];
  await render();
  expect(errors()).toEqual([item.lastRunError, item.lastRunError]);
  expect([...container.querySelectorAll("span")].filter((node) =>
    node.textContent === "failed" && !node.closest("[data-card-status]"))).toHaveLength(2);
  await render(null);
  expect(errors()).toEqual([item.lastRunError]);
});

it("preserves the card summary through loading, refresh failure and empty history", async () => {
  query.data = undefined; query.isPending = true; await render();
  expect(errors()).toEqual([item.lastRunError]);
  expect(container.textContent).toContain("Loading history");
  query.isPending = false; query.data = [latest]; query.error = new Error("History refresh failed");
  await render(); expect(errors()).toEqual([item.lastRunError, "History refresh failed"]);
  query.error = null; query.data = []; await render();
  expect(errors()).toEqual([item.lastRunError]);
});

it("does not suppress history errors when completion identity is ambiguous", async () => {
  query.data = [latest, { ...latest, id: "same-time" }]; await render();
  expect(errors()).toEqual([item.lastRunError, item.lastRunError, item.lastRunError]);
});
