// @vitest-environment happy-dom
import { act, createElement, type ComponentType, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TaskEditor } from "./tasks/task-editor";
import { AutomationEditor } from "./automations/automation-editor";
import { StewardEditor } from "./stewards/steward-editor";

const calls = vi.hoisted(() => ({ save: vi.fn(), submit: undefined as undefined | (() => void), fields: new Map<string, (value: string) => void>(), agent: undefined as undefined | ((value: Record<string, unknown>) => void) }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ request: vi.fn() }), useHostMutation: () => ({ mutate: calls.save, isPending: false }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ capabilities: [] }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => true }) }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [], directoryReady: true, isProjectVisible: () => true }) }));
vi.mock("./shared/agent", () => ({ useEffectiveAgent: (value: unknown) => value }));
vi.mock("./shared/schedule-fields", () => ({ ScheduleFields: () => null }));
vi.mock("./automations/schedule-preview", () => ({ SchedulePreview: () => null }));
vi.mock("./shared/agent-fields", () => ({ AgentFields: ({ onChange }: { onChange: (value: Record<string, unknown>) => void }) => { calls.agent = onChange; return null; } }));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/number-field")).NumberField as never));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Stack: wrapper, Section: wrapper, NumberField: () => null, Body: wrapper, Disclosure: wrapper, NavigationGroup: wrapper, SectionHeader: () => null,
    ErrorNotice: () => null, SelectField: () => null, ErrorText: () => null, MutationState: () => null, ToggleField: () => null,
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => { calls.fields.set(label, onChangeText); return null; },
    FormActions: ({ onSubmit }: { onSubmit: () => void }) => { calls.submit = onSubmit; return null; } };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks(); calls.fields.clear(); });

it.each([
  ["task", TaskEditor, "prompt", "Title"],
  ["automation", AutomationEditor, "prompt", "Name"],
  ["steward", StewardEditor, "focus", "model"],
] as const)("retains the opening %s configuration guard across parent refreshes", async (kind, Editor, remoteField, editedField) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const initial = { id: "record", projectId: "project", title: "Title", name: "Name", prompt: "Original prompt", focus: "Original focus", harness: "codex", model: "codex:old", modelSettings: {}, runtimeMode: "auto", maxRunMinutes: 0, enabled: false, scheduleKind: "daily", minute: 0, time: "09:00", dayOfWeek: 1, maxRunsPerDay: 1, maxProposals: 1, maxOpen: 1, autoStart: false, updatedAt: 1 };
  root = createRoot(container);
  const Component = Editor as unknown as ComponentType<{ initial: typeof initial; save: { mutate: typeof calls.save; mutateAsync: typeof calls.save; isPending: boolean }; busy: boolean; onClose: () => void }>;
  const render = (record: typeof initial) => root.render(createElement(Component, { initial: record, save: { mutate: calls.save, mutateAsync: calls.save, isPending: false }, busy: false, onClose: vi.fn() }));
  await act(async () => render(initial));
  await act(async () => render({ ...initial, [remoteField]: "Newer remote configuration" }));
  act(() => {
    if (editedField === "model") calls.agent!({ harness: "codex", model: "codex:edited", modelSettings: {}, runtimeMode: "auto", maxRunMinutes: 0 });
    else calls.fields.get(editedField)!("My local edit");
  });
  await act(async () => { await calls.submit!(); });
  const submitted = calls.save.mock.calls[0][0][kind];
  expect(submitted.expectedConfiguration).toEqual(initial);
  expect(submitted[remoteField]).toBe(initial[remoteField]);
  expect(submitted[editedField === "model" ? "model" : editedField.toLowerCase()]).toBe(editedField === "model" ? "codex:edited" : "My local edit");
});
