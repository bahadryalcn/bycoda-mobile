// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostGoal } from "@/domain/types";
import { GoalSettingsEditor } from "./goals/settings-editor";
import { SchedulePreview } from "./automations/schedule-preview";
import { TaskCard } from "./tasks/task-card";
import { ReviewNotes } from "./tasks/review-notes";

const state = vi.hoisted(() => ({
  machine: { id: "pc", capabilities: ["goals.settings", "automations"] },
  mutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null as Error | null, data: undefined as unknown },
  fields: new Map<string, (value: string) => void>(), submit: undefined as undefined | (() => void),
  actions: [] as Array<{ key: string; disabled?: boolean; onPress: () => void } | false | null>,
}));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/cpu", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/bot", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/ban", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-merge", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/undo-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/record-card", () => ({ RecordCard: ({ menu }: { menu: React.ReactNode }) => menu }));
vi.mock("./tasks/task-status-icon", () => ({ TaskStatusIcon: () => null }));
vi.mock("@/ui/hint", () => ({ Hint: ({children}: PropsWithChildren) => children }));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
vi.mock("./shared/record-bits", () => ({ joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · "), useRelativeTime: () => () => "" }));
vi.mock("./shared/status", () => ({ Status: () => null, statusLabel: (value: string) => value }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => state.mutation }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (token, key: string) => String(values?.[key] ?? token)),
}));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _message: string, _action: string, run: () => void) => run() }));
vi.mock("./shared/format", () => ({ stamp: (value: number) => `date:${value}` }));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Section: wrapper, NavigationGroup: wrapper, NumberField: () => null,
    Disclosure: ({ label, detail, children }: PropsWithChildren<{ label: string; detail?: string }>) =>
      createElement("details", { open: true }, createElement("summary", null, label, detail), children),
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    IconButton: wrapper, Stack: wrapper, Row: wrapper, Body: wrapper, ErrorText: () => null, ErrorNotice: () => null, ToggleField: () => null, MutationState: () => null,
    ActionMenu: ({ actions }: { actions: typeof state.actions }) => { state.actions = actions; return null; },
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Button: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => { state.fields.set(label, onChangeText); return null; },
    FormActions: ({ disabled, onSubmit }: { disabled: boolean; onSubmit: () => void }) => { state.submit = disabled ? undefined : onSubmit; return null; },
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.machine = { id: "pc", capabilities: ["goals.settings", "automations"] };
  Object.assign(state.mutation, { isPending: false, isSuccess: false, error: null, data: undefined });
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks(); state.fields.clear(); vi.unstubAllGlobals(); });

it("preserves goal draft and conflict token when a newer goal arrives, closes only on success and blocks a switched computer", async () => {
  const close = vi.fn();
  const initial = { id: "goal", title: "Goal", status: "running", updatedAt: 12, maxRunMinutes: 30 } as HostGoal;
  const render = (goal: HostGoal) => root.render(createElement(GoalSettingsEditor, { initial: goal, onClose: close }));
  await act(async () => render(initial));
  await act(async () => state.fields.get("Concurrent task limit")!("2"));
  await act(async () => render({ ...initial, updatedAt: 99, maxRunMinutes: 60 }));
  act(() => state.submit!());
  expect(state.mutation.mutate).toHaveBeenCalledWith({ goalId: "goal", expectedUpdatedAt: 12,
    settings: { autoMerge: false, continueUntilDone: false, maxRunningTasks: 2, maxRunMinutes: 30 } }, { onSuccess: close });
  expect(close).not.toHaveBeenCalled();
  state.machine = { ...state.machine, id: "other" };
  await act(async () => render(initial));
  expect(state.submit).toBeUndefined();
});

it("previews without running work and hides late results after a schedule or computer change", async () => {
  const schedule = { scheduleKind: "daily" as const, time: "09:00", minute: 0, dayOfWeek: 1 };
  const render = (time = "09:00") => root.render(createElement(SchedulePreview, { schedule: { ...schedule, time }, valid: true, disabled: false }));
  await act(async () => render());
  act(() => container.querySelector("button")!.click());
  expect(state.mutation.mutate).toHaveBeenCalledExactlyOnceWith({ schedule });
  Object.assign(state.mutation, { isSuccess: true, data: { nextRunAt: 1000, timeZone: "UTC" } });
  await act(async () => render());
  expect(container.textContent).toContain("date:1000");
  await act(async () => render("10:00"));
  expect(container.textContent).not.toContain("date:1000");
  state.machine = { ...state.machine, id: "other" };
  await act(async () => render());
  expect(container.textContent).not.toContain("date:1000");
});

it("rejects invalid preview payloads and gives an old host an update path", async () => {
  const schedule = { scheduleKind: "daily" as const, time: "09:00", minute: 0, dayOfWeek: 1 };
  const render = () => root.render(createElement(SchedulePreview, { schedule, valid: true, disabled: false }));
  await act(async () => render());
  act(() => container.querySelector("button")!.click());
  for (const data of [undefined, { nextRunAt: Infinity, timeZone: "UTC" }, { nextRunAt: 1e30, timeZone: "UTC" }, { nextRunAt: 1000, timeZone: "x".repeat(101) }]) {
    Object.assign(state.mutation, { isSuccess: true, data });
    await act(async () => render());
    expect(container.textContent).toContain("invalid schedule preview");
  }
  Object.assign(state.mutation, { isSuccess: false, error: new Error("Unsupported host method") });
  await act(async () => render());
  expect(container.textContent).toContain("Update bycoda");
  expect(container.querySelector("button")!.disabled).toBe(true);
});

it("declines only a steward to-do suggestion and never invokes ordinary task deletion", async () => {
  const decline = vi.fn();
  const remove = vi.fn();
  const props = { task: { id: "proposal", title: "Proposal", harness: "codex", model: "codex:test", prompt: "Inspect the project", source: "steward", status: "todo", dependsOn: [] },
    busy: false, editorOpen: false, tasks: [], lifecycleReady: true,
    onEdit: vi.fn(), onDelivery: vi.fn(),
    move: { ...state.mutation, mutate: vi.fn() }, start: { ...state.mutation, mutate: vi.fn() },
    finish: { ...state.mutation, mutate: vi.fn() }, recheck: { ...state.mutation, mutate: vi.fn() }, reorder: { ...state.mutation, mutate: vi.fn() },
    decline: { ...state.mutation, mutate: decline }, remove: { ...state.mutation, mutate: remove } } as unknown as Parameters<typeof TaskCard>[0];
  state.machine.capabilities.push("stewards");
  const render = () => root.render(createElement(TaskCard, props));
  await act(async () => render());
  const action = () => state.actions.find((entry) => entry && entry.key === "decline");
  const current = action();
  expect(current).toBeTruthy();
  if (current) act(() => current.onPress());
  expect(decline).toHaveBeenCalledExactlyOnceWith({ taskId: "proposal" });
  expect(remove).not.toHaveBeenCalled();
  props.task = { ...props.task, status: "queued" };
  await act(async () => render());
  expect(action()).toBeUndefined();
  props.task = { ...props.task, status: "todo", source: "manual" };
  await act(async () => render());
  expect(action()).toBeUndefined();
});

it("deletes a task card only against the revision the user confirmed", async () => {
  const remove = vi.fn();
  const props = { task: { id: "task-fake", title: "Fake task", harness: "codex", model: "codex:test", prompt: "Fake prompt", source: "manual", status: "queued", updatedAt: 12, dependsOn: [] },
    busy: false, editorOpen: false, tasks: [], lifecycleReady: true,
    onEdit: vi.fn(), onDelivery: vi.fn(),
    move: { ...state.mutation, mutate: vi.fn() }, start: { ...state.mutation, mutate: vi.fn() },
    finish: { ...state.mutation, mutate: vi.fn() }, recheck: { ...state.mutation, mutate: vi.fn() }, reorder: { ...state.mutation, mutate: vi.fn() },
    decline: { ...state.mutation, mutate: vi.fn() }, remove: { ...state.mutation, mutate: remove } } as unknown as Parameters<typeof TaskCard>[0];
  await act(async () => root.render(createElement(TaskCard, props)));
  const current = state.actions.find((entry) => entry && entry.key === "delete");
  expect(current).toBeTruthy();
  if (current) act(() => current.onPress());
  expect(remove).toHaveBeenCalledExactlyOnceWith({ taskId: "task-fake", discard: false, expectedUpdatedAt: 12 });
});

it("shows the review note counts only in the disclosure heading", async () => {
  const task = { id: "task", reviewNotes: [
    { id: "open", finding: "Open finding" },
    { id: "resolved", finding: "Resolved finding", resolvedAt: 1 },
  ] } as Parameters<typeof ReviewNotes>[0]["task"];
  await act(async () => root.render(createElement(ReviewNotes, { task })));
  expect(container.querySelector("summary")?.textContent).toContain("1 open · 1 resolved");
  expect(container.textContent?.match(/1 open · 1 resolved/g)).toHaveLength(1);
  expect(container.textContent).toContain("Open finding");
  expect(container.textContent).not.toContain("Resolved finding");
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Resolved finding");
});

it("places Run now in both management card footers and uses a separate enable icon", () => {
  for (const path of ["./automations/automation-card.tsx", "./stewards/steward-card.tsx"]) {
    const card = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(card).toMatch(/footer=\{<Button tone="primary" label=\{copy\("Şimdi çalıştır", "Run now"\)/);
    expect(card).toContain("glyph(item.enabled ? Pause : Power)");
  }
});
