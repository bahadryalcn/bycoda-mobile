// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostTask } from "@/domain/types";
import { TaskBulkActions } from "./bulk-actions";

const state = vi.hoisted(() => ({
  select: null as null | ((ids: string[]) => void),
  close: null as null | (() => void),
  approvals: [] as Array<() => void>,
  writes: vi.fn(async (_method: string, _input: unknown) => {}),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, _detail: string, _label: string, approve: () => void) =>
    state.approvals.push(approve),
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: (method: string) => ({
    mutateAsync: (input: unknown) => state.writes(method, input),
  }),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: wrapper,
    Row: wrapper,
    Disclosure: wrapper,
    Loading: () => null,
    ErrorNotice: ({ error }: { error: unknown }) =>
      error ? createElement("p", null, String(error)) : null,
    Notice: ({
      message,
      onRetry,
      retryLabel,
      retrying,
    }: {
      message: string;
      onRetry(): void;
      retryLabel: string;
      retrying?: boolean;
    }) =>
      createElement(
        "div",
        null,
        message,
        createElement("button", { onClick: onRetry, disabled: retrying }, retryLabel),
      ),
    ActionMenu: ({
      actions,
    }: {
      actions: { key: string; label: string; disabled?: boolean; onPress: () => void }[];
    }) =>
      createElement(
        "div",
        null,
        actions.map((action) =>
          createElement(
            "button",
            { key: action.key, disabled: action.disabled, onClick: action.onPress },
            action.label,
          ),
        ),
      ),
    Button: ({
      label,
      accessibilityLabel,
      disabled,
      onPress,
    }: {
      label: string;
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress: () => void;
    }) =>
      createElement(
        "button",
        { disabled, "aria-label": accessibilityLabel, onClick: onPress },
        label,
      ),
    MultiSelectField: ({
      values,
      onChange,
    }: {
      values: string[];
      onChange: (ids: string[]) => void;
    }) => {
      state.select = onChange;
      return createElement("output", null, values.join(","));
    },
    Sheet: ({
      visible,
      onClose,
      footer,
      children,
    }: PropsWithChildren<{
      visible: boolean;
      onClose: () => void;
      footer: import("react").ReactNode;
    }>) => {
      state.close = onClose;
      return visible ? createElement("section", null, children, footer) : null;
    },
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
const render = () =>
  act(async () =>
    root.render(
      createElement(TaskBulkActions, {
        tasks,
        machineId: "original-machine",
        disabled: false,
        onBusy: busy,
        onComplete: complete,
      }),
    ),
  );
const click = (label: string) =>
  act(async () => {
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === label || button.textContent === label,
    );
    expect(button, label).toBeDefined();
    button!.click();
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  tasks = [task];
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  state.approvals = [];
  state.select = null;
  state.close = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("retires deferred approval when its panel closes and opens again", async () => {
  await render();
  await click("Bulk actions");
  await act(async () => state.select!([task.id]));
  await click("Delete");
  const oldApproval = state.approvals[0];
  await act(async () => state.close!());
  await click("Bulk actions");
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
  await click("Bulk actions");
  await act(async () => state.select!([task.id]));
  await click("Delete");
  const approve = state.approvals[0];
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => approve());
  expect(state.writes).not.toHaveBeenCalled();
  expect(busy).not.toHaveBeenCalled();
});

it("retains selection on close but never silently reselects a task that left and returned", async () => {
  await render();
  await click("Bulk actions");
  await act(async () => state.select!([task.id]));
  await act(async () => state.close!());
  await click("Bulk actions");
  expect(container.querySelector("output")?.textContent).toBe(task.id);
  tasks = [];
  await render();
  tasks = [task];
  await render();
  expect(container.querySelector("output")?.textContent).toBe("");
  await click("Select all results");
  await click("Start");
  expect(state.writes).toHaveBeenCalledExactlyOnceWith("tasks.start", { taskId: task.id });
});

it("refreshes accepted bulk results without repeating the mutation after a read failure", async () => {
  complete.mockRejectedValueOnce(new Error("Refresh offline"));
  await render();
  await click("Bulk actions");
  await act(async () => state.select!([task.id]));
  await click("Start");
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(
    "Task results are kept, but the list could not be refreshed.",
  );
  expect(container.querySelector("output")!.textContent).toBe(task.id);
  await click("Refresh");
  expect(complete).toHaveBeenCalledTimes(2);
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain(
    "Task results are kept, but the list could not be refreshed.",
  );
});
