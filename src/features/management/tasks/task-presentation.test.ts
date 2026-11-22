// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TaskCardProps, TaskDraft, TaskEditorProps } from "./types";

const fixture = vi.hoisted(() => ({
  select: undefined as undefined | { value: string; onChange: (value: string) => void },
  dirty: false,
  fields: new Map<string, { value: string; onChangeText(value: string): void }>(),
  save: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("../../workspace/use-project-directory", () => ({
  useProjectList: () => ({
    data: [{ id: "project", name: "Project" }],
    directoryReady: true,
    isProjectVisible: () => true,
  }),
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => ({ token: "test-connection", isCurrent: () => true }),
}));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("../shared/format", () => ({ stamp: () => "Created" }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "pc", name: "Harbor computer", capabilities: ["tasks.workspaces", "workspaces.delivery.v1"] }),
}));
vi.mock("@/state/queries", () => ({ useHostClient: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/sheet-guard", () => ({
  useSheetGuard: ({ dirty }: { dirty: boolean }) => {
    fixture.dirty = dirty;
    return { requestClose: vi.fn() };
  },
}));
vi.mock("../shared/record-bits", () => ({ joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · "), useRelativeTime: () => () => "" }));
vi.mock("../shared/agent", () => ({ useEffectiveAgent: (value: unknown) => value }));
vi.mock("../shared/agent-fields", () => ({ AgentFields: () => null }));
vi.mock("@/ui/hint", () => ({ Hint: ({ children }: PropsWithChildren) => children }));
vi.mock("./review-notes", () => ({ ReviewNotes: () => null }));
vi.mock("./task-feedback", () => ({ TaskDeclineFeedback: () => null }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({
    children,
    details,
    footer,
    status,
    menu,
  }: PropsWithChildren<{ details: ReactNode; footer: ReactNode; status: ReactNode; menu: ReactNode }>) =>
    createElement("div", null, status, details, children, createElement("nav", null, menu), createElement("footer", null, footer)),
}));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/primitives")).NumberField as never));
vi.mock("@/ui/primitives", () => {
  const Box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Action = ({ label, disabled, onPress, tone }: { label: string; disabled?: boolean; onPress: () => void; tone?: string }) =>
    createElement("button", { disabled, onClick: onPress, "data-tone": tone }, label);
  return {
    Body: Box,
    Stack: Box,
    Row: Box,
    Disclosure: Box,
    NavigationGroup: Box,
    Badge: ({ label }: { label: string }) => createElement("output", null, label),
    SelectField: (props: typeof fixture.select) => {
      fixture.select = props;
      return null;
    },
    NumberField: (props: { label: string; value: string; onChangeText(value: string): void }) => {
      fixture.fields.set(props.label, props);
      return null;
    },
    Field: (props: { label: string; value: string; onChangeText(value: string): void }) => {
      fixture.fields.set(props.label, props);
      return null;
    },
    FormActions: ({ disabled, submitLabel, onSubmit, cancelLabel, onCancel }: {
      disabled?: boolean; submitLabel: string; onSubmit(): void; cancelLabel?: string; onCancel?(): void;
    }) => createElement("div", null,
      createElement("button", { disabled, onClick: onSubmit }, submitLabel),
      onCancel && createElement("button", { onClick: onCancel }, cancelLabel),
    ),
    Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) =>
      visible ? createElement("section", { role: "dialog", "aria-label": title }, children) : null,
    ToggleField: () => null,
    Button: Action,
    IconButton: Action,
    ActionMenu: ({ actions }: { actions: Array<false | ({ key: string } & Parameters<typeof Action>[0])> }) =>
      actions.map(action => action && createElement(Action, { ...action, key: action.key })),
    MutationState: () => null,
    ErrorNotice: () => null,
  };
});
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
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
import { TaskCard } from "./task-card";
import { TaskEditor } from "./task-editor";

let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.fields.clear();
  fixture.dirty = false;
  fixture.save.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it("guards an invalid minute draft and blocks saving its previous numeric value", async () => {
  const initial = {
    id: "task",
    projectId: "project",
    title: "Review",
    prompt: "Review files",
    harness: "claude",
    model: "model",
    modelSettings: {},
    maxRunMinutes: 30,
  } as TaskDraft;
  await act(async () =>
    root.render(
      createElement(TaskEditor, {
        initial,
        save: { mutate: fixture.save } as unknown as TaskEditorProps["save"],
        busy: false,
        onClose: vi.fn(),
      }),
    ),
  );
  expect(fixture.dirty).toBe(false);
  await act(async () =>
    fixture.fields.get("Run limit")!.onChangeText("invalid"),
  );
  expect(fixture.dirty).toBe(true);
  expect(fixture.fields.get("Run limit")!.value).toBe("invalid");
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(fixture.save).not.toHaveBeenCalled();
});
it("shows a known one-based queue position and never invents zero for a missing task", async () => {
  const task = {
    id: "task",
    title: "Review",
    prompt: "Review files",
    projectId: "project",
    status: "queued",
    harness: "claude",
    model: "model",
    modelSettings: {},
  } as TaskCardProps["task"];
  const mutation = { isPending: false, mutate: vi.fn() };
  const props = {
    task,
    tasks: [],
    busy: false,
    editorOpen: false,
    onEdit: vi.fn(),
    onDelivery: vi.fn(), onReviewDelivery: vi.fn(),
    move: mutation,
    remove: mutation,
    decline: mutation,
    recheck: mutation,
    finish: mutation,
    start: mutation,
    reorder: mutation,
    lifecycleReady: true,
  } as unknown as TaskCardProps;
  await act(async () => root.render(createElement(TaskCard, props)));
  expect(container.textContent).not.toContain("Queue position on computer");
  await act(async () => root.render(createElement(TaskCard, { ...props, tasks: [task] })));
  expect(container.textContent).toContain("Queue position on computer: 1");
  expect(mutation.mutate).not.toHaveBeenCalled();
});

it("requires a project in a new task before saving", async () => {
  const initial = {
    id: "new",
    projectId: "",
    title: "Task",
    prompt: "Work",
    harness: "claude",
    model: "model",
    modelSettings: {},
    maxRunMinutes: 0,
  } as TaskDraft;
  await act(async () =>
    root.render(
      createElement(TaskEditor, {
        initial,
        save: { mutate: fixture.save } as unknown as TaskEditorProps["save"],
        busy: false,
        onClose: vi.fn(),
      }),
    ),
  );
  expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
  await act(async () => fixture.select!.onChange("project"));
  expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
});

it.each([
  ["review", "In review"],
  ["done", "Done"],
  ["running", "Running"],
  ["verifying", "Verifying"],
])("uses the distinct %s task label", async (status, label) => {
  const mutation = { isPending: false, mutate: vi.fn() };
  const props = {
    task: {
      id: "task",
      title: "Fixture task",
      prompt: "Review files",
      projectId: "project",
      status,
      harness: "claude",
      model: "model",
      modelSettings: {},
    },
    tasks: [],
    busy: false,
    editorOpen: false,
    onEdit: vi.fn(),
    onDelivery: vi.fn(), onReviewDelivery: vi.fn(),
    move: mutation,
    remove: mutation,
    decline: mutation,
    recheck: mutation,
    finish: mutation,
    start: mutation,
    reorder: mutation,
    lifecycleReady: true,
  } as unknown as TaskCardProps;
  await act(async () => root.render(createElement(TaskCard, props)));
  expect(container.querySelector("output")?.textContent).toBe(label);
});

function cardFor(task: Partial<TaskCardProps["task"]>, lifecycleReady = true) {
  const mutation = { isPending: false, mutate: vi.fn() };
  return {
    task: {
      id: "task", title: "Harbor checklist", prompt: "Review files", projectId: "project",
      status: "blocked", sessionId: "previous-worker", harness: "claude", model: "model", modelSettings: {},
      ...task,
    },
    tasks: [], busy: false, editorOpen: false, onEdit: vi.fn(), onDelivery: vi.fn(), onReviewDelivery: vi.fn(),
    move: mutation, remove: mutation, decline: mutation, recheck: mutation, finish: mutation, start: mutation, reorder: mutation,
    lifecycleReady,
  } as unknown as TaskCardProps;
}
const action = (label: string, region: HTMLElement = container) =>
  [...region.querySelectorAll("button")].find(button => button.textContent === label);
const confirmation = () => container.querySelector<HTMLElement>('[role="dialog"]')!;

it.each(["previous-worker", undefined])("offers one primary Retry for a blocked task with session %s", async sessionId => {
  const props = cardFor({ sessionId });
  await act(async () => root.render(createElement(TaskCard, props)));
  const retry = action("Retry", container.querySelector("footer")!);
  expect(retry?.dataset.tone).toBe("primary");
  expect(action("Retry", container.querySelector("nav")!)).toBeUndefined();
  expect(action("Start now", container.querySelector("nav")!)).toBeUndefined();
  for (const label of ["Queue", "Edit", "Delete"]) expect(action(label, container.querySelector("nav")!)).toBeDefined();
  await act(async () => retry!.click());
  expect(props.start.mutate).toHaveBeenCalledExactlyOnceWith({ taskId: "task" });
});

it.each(["instructions", "lifecycle", "dependency"])("does not offer Retry when %s blocks admission", async reason => {
  const props = cardFor(reason === "instructions" ? { prompt: "" }
    : reason === "dependency" ? { dependsOn: ["dependency"] } : {}, reason !== "lifecycle");
  if (reason === "dependency") props.tasks = [{ ...props.task, id: "dependency", status: "todo" }];
  await act(async () => root.render(createElement(TaskCard, props)));
  expect(action("Retry")).toBeUndefined();
  expect(action("Edit")).toBeDefined();
});

it("names the exact task and computer before stopping", async () => {
  const props = cardFor({ status: "running" });
  await act(async () => root.render(createElement(TaskCard, props)));
  await act(async () => action("Stop")!.click());
  expect(confirmation().getAttribute("aria-label")).toBe("Stop task");
  expect(confirmation().textContent).toContain("Harbor checklist · Harbor computer");
  expect(confirmation().textContent).toContain("Active work will stop and work files will be retained.");
  await act(async () => action("Cancel", confirmation())!.click());
  expect(confirmation()).toBeNull();
  expect(props.move.mutate).not.toHaveBeenCalled();
  await act(async () => action("Stop")!.click());
  await act(async () => action("Stop", confirmation())!.click());
  expect(props.move.mutate).toHaveBeenCalledExactlyOnceWith({ taskId: "task", to: "blocked" });
});

it("names the reviewed task before completion and discards a stale confirmation", async () => {
  const props = cardFor({ status: "todo", sessionId: undefined, updatedAt: 12 });
  await act(async () => root.render(createElement(TaskCard, props)));
  await act(async () => action("Complete")!.click());
  expect(confirmation().getAttribute("aria-label")).toBe("Complete task");
  expect(confirmation().textContent).toContain("Harbor checklist · Harbor computer");
  await act(async () => root.render(createElement(TaskCard, {
    ...props, task: { ...props.task, updatedAt: 13 },
  })));
  await act(async () => action("Complete", confirmation())!.click());
  expect(props.move.mutate).not.toHaveBeenCalled();
  await act(async () => action("Complete")!.click());
  const acceptCurrent = action("Complete", confirmation())!;
  await act(async () => { acceptCurrent.click(); acceptCurrent.click(); });
  expect(props.move.mutate).toHaveBeenCalledExactlyOnceWith({ taskId: "task", to: "done" });
});

it("opens the reviewed merge flow without issuing a task completion request", async () => {
  const props = cardFor({ status: "review", branch: "bycoda/t/work" });
  await act(async () => root.render(createElement(TaskCard, props)));
  const delivery = action("Review delivery", container.querySelector("footer")!);
  expect(delivery).toBeDefined();
  expect(action("Complete")).toBeUndefined();
  await act(async () => delivery!.click());
  expect(props.onReviewDelivery).toHaveBeenCalledExactlyOnceWith(props.task);
  expect(confirmation()).toBeNull();
  expect(props.move.mutate).not.toHaveBeenCalled();

  await act(async () => root.render(createElement(TaskCard, { ...props, task: { ...props.task, merged: true } })));
  expect(action("Complete")).toBeDefined();
  expect(action("Review delivery")).toBeUndefined();
});
