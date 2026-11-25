// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostTask } from "@/domain/types";
import { useTaskBulkActions } from "./bulk-actions";

const state = vi.hoisted(() => ({
  approvals: [] as Array<() => void>,
  cancelLabels: [] as Array<string | undefined>,
  writes: vi.fn(async (_method: string, _input: unknown) => {}),
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(p\d+)\}/g, (placeholder, key) => String(values?.[key] ?? placeholder)),
}));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, _detail: string, _label: string, approve: () => void, cancel?: string) => {
    state.approvals.push(approve);
    state.cancelLabels.push(cancel);
  },
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: (method: string) => ({
    mutateAsync: (input: unknown) => state.writes(method, input),
  }),
}));
vi.mock("react-native", () => ({
  View: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) =>
    createElement("div", { "aria-label": accessibilityLabel }, children),
  StyleSheet: { hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: wrapper,
    Row: wrapper,
    Disclosure: wrapper,
    Loading: () => null,
    ErrorNotice: ({ error }: { error: unknown }) =>
      error ? createElement("p", null, String(error)) : null,
    Notice: ({ message, onRetry, retryLabel, retrying }: {
      message: string; onRetry(): void; retryLabel: string; retrying?: boolean;
    }) =>
      createElement("div", null, message, createElement("button", { onClick: onRetry, disabled: retrying }, retryLabel)),
    Button: ({ label, accessibilityLabel, disabled, onPress }: {
      label: string; accessibilityLabel?: string; disabled?: boolean; onPress: () => void;
    }) => createElement("button", { disabled, "aria-label": accessibilityLabel, onClick: onPress }, label),
  };
});
const task = {
  id: "original-task",
  projectId: "project",
  title: "Original",
  prompt: "Instructions",
  status: "todo",
  updatedAt: 12,
} as HostTask;
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, tasks: HostTask[];
const complete = vi.fn(async () => {}),
  busy = vi.fn();

/** A list owner: header entry and feedback, one toggle per row, and the bottom bar. */
function Harness({ tasks }: { tasks: HostTask[] }) {
  // A fresh array each render, as the real list recomputes its visible tasks.
  const bulk = useTaskBulkActions({ tasks: [...tasks], machineId: "original-machine", disabled: false, onBusy: busy, onComplete: complete });
  return createElement("main", null, bulk.entry, bulk.feedback,
    bulk.selection.active ? tasks.map((item) => createElement("button", {
      key: item.id, role: "checkbox", "aria-checked": bulk.selection.isSelected(item.id), onClick: () => bulk.selection.toggle(item.id),
    }, `Toggle ${item.title}`)) : null,
    bulk.bar);
}
const render = () => act(async () => root.render(createElement(Harness, { tasks })));
const find = (label: string) => [...container.querySelectorAll("button")].find(
  (button) => button.getAttribute("aria-label") === label || button.textContent === label,
);
const click = (label: string) =>
  act(async () => {
    const button = find(label);
    expect(button, label).toBeDefined();
    button!.click();
  });
const bar = () => container.querySelector('[aria-label="Bulk actions"]');
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  tasks = [task];
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  state.approvals = [];
  state.cancelLabels = [];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("omits the selection entry when no tasks are visible", async () => {
  tasks = [];
  await render();
  expect(find("Select tasks")).toBeUndefined();
  expect(bar()).toBeNull();
});

it("selects rows in the list and shows the count in a bottom bar, keeping the selection after Done", async () => {
  await render();
  expect(bar()).toBeNull();
  await click("Select tasks");
  expect(bar()?.textContent).toContain("Select tasks");
  expect(find("Start")?.hasAttribute("disabled")).toBe(true);
  await click("Toggle Original");
  expect(bar()?.textContent).toContain("1 selected");
  await click("Done");
  expect(bar()).toBeNull();
  await click("Select tasks");
  expect(bar()?.textContent).toContain("1 selected");
});

it("confirms Delete with the shared Cancel wording and retires the approval if its task leaves the results", async () => {
  await render();
  await click("Select tasks");
  await click("Toggle Original");
  await click("Delete");
  expect(state.cancelLabels).toEqual(["Cancel"]);
  const approve = state.approvals[0]!;
  tasks = [];
  await render();
  expect(bar()).toBeNull();
  await act(async () => approve());
  expect(state.writes).not.toHaveBeenCalled();
});

it("retires a deferred approval when selection mode ends and starts again", async () => {
  await render();
  await click("Select tasks");
  await click("Toggle Original");
  await click("Delete");
  const oldApproval = state.approvals[0];
  await click("Done");
  await click("Select tasks");
  await act(async () => oldApproval());
  expect(state.writes).not.toHaveBeenCalled();
  await click("Delete");
  await act(async () => state.approvals[1]());
  expect(state.writes).toHaveBeenCalledExactlyOnceWith("tasks.delete", {
    taskId: task.id,
    expectedUpdatedAt: 12,
  });
  expect(complete).toHaveBeenCalledOnce();
});

it("retires a native approval after the collection owner unmounts", async () => {
  await render();
  await click("Select tasks");
  await click("Toggle Original");
  await click("Delete");
  const approve = state.approvals[0];
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => approve());
  expect(state.writes).not.toHaveBeenCalled();
  expect(busy).not.toHaveBeenCalled();
});

it("never silently reselects a task that left and returned", async () => {
  await render();
  await click("Select tasks");
  await click("Toggle Original");
  tasks = [];
  await render();
  tasks = [task];
  await render();
  await click("Select tasks");
  expect(bar()?.textContent).not.toContain("1 selected");
  await click("Select all");
  await click("Start");
  expect(state.writes).toHaveBeenCalledExactlyOnceWith("tasks.start", { taskId: task.id });
});

it("refreshes accepted bulk results without repeating the mutation after a read failure", async () => {
  complete.mockRejectedValueOnce(new Error("Refresh offline"));
  await render();
  await click("Select tasks");
  await click("Toggle Original");
  await click("Start");
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(
    "Task results are kept, but the list could not be refreshed.",
  );
  expect(bar()?.textContent).toContain("1 selected");
  await click("Refresh");
  expect(complete).toHaveBeenCalledTimes(2);
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain(
    "Task results are kept, but the list could not be refreshed.",
  );
});
