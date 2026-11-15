// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HostAutomation, HostAutomationRun } from "@/domain/types";
import { AutomationCard } from "./automation-card";
import { summarizedAutomationRun } from "./automation-feedback";
import type { AutomationCardProps } from "./types";

const query = vi.hoisted(() => ({ data: [] as HostAutomationRun[] | undefined, error: null as Error | null, isPending: false }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => query }));
const navigation = vi.hoisted(() => ({ current: true, push: vi.fn() }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => navigation.current }) }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer" }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: { caption: {} } }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/history", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("@/ui/week-hours", () => ({ HoursOverview: () => null }));
vi.mock("../shared/record-bits", () => ({ RecordTrailing: ({ children }: PropsWithChildren) => createElement("div", null, children), useMenuGlyph: () => () => null, useRelativeTime: () => () => "soon", joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · ") }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("expo-router", () => ({ router: { navigate: navigation.push } }));
vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", null, title, children) }));
vi.mock("../shared/format", () => ({ stamp: (value: number) => String(value) }));
vi.mock("../shared/status", () => ({ Status: ({ value }: { value: string }) => createElement("span", null, value) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label), Row: Wrapper, Stack: Wrapper, Separator: () => null,
    Sheet: Wrapper,
    ScreenList: ({ data, header, renderItem }: { data: HostAutomationRun[]; header: import("react").ReactNode; renderItem: (entry: { item: HostAutomationRun }) => import("react").ReactNode }) => createElement("div", null, header, data.map(item => createElement("div", { key: item.id }, renderItem({ item })))),
    ActionMenu: () => null, IconButton: () => null, MutationState: () => null,
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
async function render(historyId: string | null = item.id) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  const mutation = { isPending: false, variables: undefined, mutate: vi.fn() };
  await act(async () => root!.render(createElement(AutomationCard, {
    item, historyId, busy: false, editorOpen: false, onEdit: vi.fn(), onHistory: vi.fn(),
    save: mutation as unknown as AutomationCardProps["save"],
    run: mutation as unknown as AutomationCardProps["run"],
    remove: mutation as unknown as AutomationCardProps["remove"],
  })));
}
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  query.data = []; query.error = null; query.isPending = false; vi.unstubAllGlobals();
  navigation.current = true; navigation.push.mockClear();
});
const errors = () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent);

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
  expect(container.textContent?.match(/failed/g)).toHaveLength(2);
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
