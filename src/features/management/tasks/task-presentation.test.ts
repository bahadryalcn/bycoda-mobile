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
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("../shared/format", () => ({ stamp: () => "Created" }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "pc", capabilities: ["tasks.workspaces"] }),
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
vi.mock("../shared/status", () => ({ Status: () => null, statusLabel: (value: string) => value }));
vi.mock("@/ui/hint", () => ({ Hint: ({ children }: PropsWithChildren) => children }));
vi.mock("./review-notes", () => ({ ReviewNotes: () => null }));
vi.mock("./task-feedback", () => ({ TaskDeclineFeedback: () => null }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({
    children,
    details,
    footer,
  }: PropsWithChildren<{ details: ReactNode; footer: ReactNode }>) =>
    createElement("div", null, details, children, footer),
}));
vi.mock("@/ui/primitives", () => {
  const Box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Box,
    Stack: Box,
    Row: Box,
    Disclosure: Box,
    NavigationGroup: Box,
    SelectField: (props: typeof fixture.select) => {
      fixture.select = props;
      return null;
    },
    Field: (props: { label: string; value: string; onChangeText(value: string): void }) => {
      fixture.fields.set(props.label, props);
      return null;
    },
    FormActions: ({ disabled, onSubmit }: { disabled?: boolean; onSubmit(): void }) =>
      createElement("button", { disabled, onClick: onSubmit }, "Save"),
    ToggleField: () => null,
    Button: () => null,
    IconButton: () => null,
    ActionMenu: () => null,
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
    fixture.fields.get("Run limit (minutes, 0 = unlimited)")!.onChangeText("invalid"),
  );
  expect(fixture.dirty).toBe(true);
  expect(fixture.fields.get("Run limit (minutes, 0 = unlimited)")!.value).toBe("invalid");
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
    onDelivery: vi.fn(),
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
