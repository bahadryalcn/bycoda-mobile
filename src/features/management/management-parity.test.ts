// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type RefObject } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostGoal } from "@/domain/types";
import { GoalSettingsEditor } from "./goals/settings-editor";
import { GoalCard } from "./goals/goal-card";
import { SchedulePreview } from "./automations/schedule-preview";
import { TaskCard } from "./tasks/task-card";
import { ReviewNotes } from "./tasks/review-notes";

const state = vi.hoisted(() => ({
  machine: { id: "pc", name: "Harbor computer", capabilities: ["goals.settings", "automations"] },
  currentConnection: true,
  epoch: "first",
  mutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null as Error | null, data: undefined as unknown },
  fields: new Map<string, (value: string) => void>(), submit: undefined as undefined | (() => void),
  autoMerge: undefined as undefined | ((value: boolean) => void),
  reviewSubmit: undefined as undefined | (() => void),
  reviewReturnFocus: undefined as RefObject<HTMLButtonElement | null> | undefined,
  actions: [] as Array<{ key: string; disabled?: boolean; onPress: () => void } | false | null>,
}));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
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
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({ menu, metadata }: { menu: React.ReactNode; metadata?: string }) =>
    createElement("article", null, createElement("output", null, metadata), menu),
}));
vi.mock("@/ui/plan-steps", () => ({ PlanSteps: () => null }));
vi.mock("./tasks/task-status-icon", () => ({ TaskStatusIcon: () => null }));
vi.mock("@/ui/hint", () => ({ Hint: ({children}: PropsWithChildren) => children }));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
vi.mock("./shared/record-bits", () => ({
  joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · "),
  useRelativeTime: () => () => "",
  useMenuGlyph: () => () => null,
  RecordTrailing: ({ children }: PropsWithChildren) => children,
}));
vi.mock("./shared/status", () => ({ Status: () => null, statusLabel: (value: string) => value }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => state.mutation }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (token, key: string) => String(values?.[key] ?? token)),
}));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const token = state.epoch;
    return { token, isCurrent: () => state.currentConnection && state.epoch === token };
  },
}));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("./shared/format", () => ({ stamp: (value: number) => `date:${value}` }));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/number-field")).NumberField as never));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Section: wrapper, NavigationGroup: wrapper, NumberField: () => null,
    Sheet: ({ children, title, returnFocusRef }: PropsWithChildren<{
      title: string; returnFocusRef?: RefObject<HTMLButtonElement | null>;
    }>) => {
      state.reviewReturnFocus = returnFocusRef;
      return createElement("section", { role: "dialog", "aria-label": title }, children);
    },
    Disclosure: ({ label, detail, children }: PropsWithChildren<{ label: string; detail?: string }>) =>
      createElement("details", { open: true }, createElement("summary", null, label, detail), children),
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    IconButton: wrapper, Stack: wrapper, Row: wrapper, Body: wrapper, ErrorText: () => null, ErrorNotice: () => null,
    ToggleField: ({ label, onChange }: { label: string; onChange: (value: boolean) => void }) => {
      if (label === "Auto merge") state.autoMerge = onChange;
      return null;
    }, MutationState: () => null,
    ActionMenu: ({ actions }: { actions: typeof state.actions }) => { state.actions = actions; return null; },
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Button: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => { state.fields.set(label, onChangeText); return null; },
    FormActions: ({ disabled, submitLabel, onSubmit, onCancel, submitRef }: {
      disabled: boolean; submitLabel: string; onSubmit: () => void; onCancel: () => void;
      submitRef?: RefObject<HTMLButtonElement | null>;
    }) => {
      if (submitLabel === "Save") {
        state.submit = disabled ? undefined : onSubmit;
        return createElement("button", { ref: submitRef, disabled, onClick: onSubmit }, submitLabel);
      }
      state.reviewSubmit = onSubmit;
      return createElement("div", null,
        createElement("button", { onClick: onCancel }, "Cancel"),
        createElement("button", { onClick: onSubmit }, submitLabel));
    },
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.machine = { id: "pc", name: "Harbor computer", capabilities: ["goals.settings", "automations"] };
  state.currentConnection = true;
  state.epoch = "first";
  state.reviewSubmit = undefined;
  state.reviewReturnFocus = undefined;
  Object.assign(state.mutation, { isPending: false, isSuccess: false, error: null, data: undefined });
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks(); state.fields.clear(); vi.unstubAllGlobals(); });

it.each([
  [0, "0 tasks"],
  [1, "1 task"],
  [2, "2 tasks"],
])("uses the right wording for an epic with %s planned tasks", async (count, label) => {
  const goal = {
    id: "goal",
    title: "Goal",
    status: "awaiting-approval",
    projectIds: [],
    taskIds: [],
    plan: { tasks: Array.from({ length: count }, (_, index) => ({ key: String(index), title: "Plan step", dependsOn: [] })) },
  } as unknown as HostGoal;
  const props = {
    goal, projects: [], busy: false, editorOpen: false, onReplan: vi.fn(), onSettings: vi.fn(),
    approve: state.mutation, cancel: state.mutation, remove: state.mutation,
  } as unknown as Parameters<typeof GoalCard>[0];
  await act(async () => root.render(createElement(GoalCard, props)));
  expect(container.querySelector("output")?.textContent).toBe(label);
});

it("names the reviewed epic and only cancels after confirmation", async () => {
  const goal = { id: "goal", title: "Harbor plan", status: "awaiting-approval", updatedAt: 12, projectIds: [], taskIds: [] } as unknown as HostGoal;
  const props = { goal, projects: [], busy: false, editorOpen: false, onReplan: vi.fn(), onSettings: vi.fn(),
    approve: state.mutation, cancel: state.mutation, remove: state.mutation,
  } as unknown as Parameters<typeof GoalCard>[0];
  await act(async () => root.render(createElement(GoalCard, props)));
  const cancel = state.actions.find((item) => item && item.key === "cancel");
  if (!cancel) throw new Error("Cancel action not found");
  await act(async () => cancel.onPress());
  const sheet = container.querySelector('[role="dialog"][aria-label="Cancel epic"]');
  expect(sheet?.textContent).toContain("Harbor plan · Harbor computer");
  expect(sheet?.textContent).toContain("The goal and its active tasks will stop");
  expect(state.mutation.mutate).not.toHaveBeenCalled();
  const acceptStale = state.reviewSubmit!;
  state.currentConnection = false;
  await act(async () => acceptStale());
  expect(state.mutation.mutate).not.toHaveBeenCalled();
  state.currentConnection = true;
  await act(async () => cancel.onPress());
  const acceptCurrent = state.reviewSubmit!;
  await act(async () => { acceptCurrent(); acceptCurrent(); });
  expect(state.mutation.mutate).toHaveBeenCalledExactlyOnceWith({ goalId: "goal" });
});

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

it("rejects a delayed auto-merge confirmation after the pairing changes under the same saved row", async () => {
  const initial = { id: "goal", title: "Goal", status: "running", updatedAt: 12, maxRunMinutes: 30, isolate: true } as HostGoal;
  const render = () => root.render(createElement(GoalSettingsEditor, { initial, onClose: vi.fn() }));
  await act(async () => render());
  await act(async () => state.autoMerge!(true));
  await act(async () => state.submit!());
  const sheet = container.querySelector('[role="dialog"][aria-label="Auto merge"]');
  expect(sheet?.textContent).toContain("Goal · Harbor computer");
  expect(sheet?.textContent).toContain("without waiting for another approval");
  const accept = state.reviewSubmit!;
  state.epoch = "repaired";
  await act(async () => render());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => accept());
  expect(state.mutation.mutate).not.toHaveBeenCalled();
});

it("returns an auto-merge review to the same Save control with the settings still unsaved", async () => {
  const initial = { id: "goal", title: "Goal", status: "running", updatedAt: 12, maxRunMinutes: 30, isolate: true } as HostGoal;
  await act(async () => root.render(createElement(GoalSettingsEditor, { initial, onClose: vi.fn() })));
  await act(async () => state.autoMerge!(true));
  const save = container.querySelector("button")!;
  expect(save.textContent).toBe("Save");
  await act(async () => save.click());
  const sheet = container.querySelector('[role="dialog"][aria-label="Auto merge"]')!;
  expect(state.reviewReturnFocus?.current).toBe(save);
  await act(async () => sheet.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector("button")).toBe(save);
  expect(save.disabled).toBe(false);
  expect(state.mutation.mutate).not.toHaveBeenCalled();
});

it("retires an auto-merge review when the Host refuses access and keeps the settings draft", async () => {
  const initial = { id: "goal", title: "Goal", status: "running", updatedAt: 12, maxRunMinutes: 30, isolate: true } as HostGoal;
  const close = vi.fn();
  const render = (accessDenied: boolean) => root.render(createElement(GoalSettingsEditor, { initial, onClose: close, accessDenied }));
  await act(async () => render(false));
  await act(async () => state.autoMerge!(true));
  await act(async () => state.submit!());
  const accept = state.reviewSubmit!;
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();

  await act(async () => render(true));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain("Computer access was denied. Reconnect this computer.");
  expect(state.submit).toBeUndefined();

  await act(async () => render(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => accept());
  expect(state.mutation.mutate).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  await act(async () => state.submit!());
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
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
    onEdit: vi.fn(), onDelivery: vi.fn(), onReviewDelivery: vi.fn(),
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
  act(() => state.reviewSubmit!());
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
    onEdit: vi.fn(), onDelivery: vi.fn(), onReviewDelivery: vi.fn(),
    move: { ...state.mutation, mutate: vi.fn() }, start: { ...state.mutation, mutate: vi.fn() },
    finish: { ...state.mutation, mutate: vi.fn() }, recheck: { ...state.mutation, mutate: vi.fn() }, reorder: { ...state.mutation, mutate: vi.fn() },
    decline: { ...state.mutation, mutate: vi.fn() }, remove: { ...state.mutation, mutate: remove } } as unknown as Parameters<typeof TaskCard>[0];
  await act(async () => root.render(createElement(TaskCard, props)));
  const current = state.actions.find((entry) => entry && entry.key === "delete");
  expect(current).toBeTruthy();
  if (current) act(() => current.onPress());
  act(() => state.reviewSubmit!());
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

it("keeps Run now and Pause or Enable side by side in both management card footers", () => {
  for (const path of ["./automations/automation-card.tsx", "./stewards/steward-card.tsx"]) {
    const card = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(card).toMatch(/footer=\{<Row>\s*<Button tone="primary" label=\{copy\("Şimdi çalıştır", "Run now"\)/);
    expect(card).toContain('<Button tone="secondary" label={item.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Enable")}');
    expect(card).not.toContain('key: "toggle"');
  }
});
