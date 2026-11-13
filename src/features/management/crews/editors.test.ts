// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CrewEditor } from "./crew-editor";
import { StartCrewEditor } from "./start-editor";
import { CrewAssignmentEditor } from "./assignment-editor";
import type { CrewRunView } from "@/remote/contracts/crews";
import { newDefinition } from "./model";

function validCrew() {
  const definition = newDefinition("crew", "project");
  definition.name = "Delivery crew";
  definition.updatedAt = 10;
  definition.agents = definition.agents.map((agent) => ({ ...agent, name: agent.role, candidates: [{ id: `model-${agent.id}`, harness: "codex", model: "codex:model", modelSettings: {}, capabilities: {} }] }));
  return definition;
}

const state = vi.hoisted(() => ({
  machine: { id: "pc", capabilities: ["crews.v1", "crews.tasks.v1"] }, activeId: "pc",
  fields: new Map<string, (value: string) => void>(), submit: undefined as undefined | (() => void),
  mutate: vi.fn(),
}));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }), HintSection: ({ children }: PropsWithChildren) => createElement("div", null, children), InfoHint: () => null, InfoPanel: () => null, HintLabel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine, useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutate: state.mutate, isPending: false, isError: false }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _text: string, _label: string, run: () => void) => run() }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("../shared/format", () => ({ identifier: () => "stable-request" }));
vi.mock("./member-avatar", () => ({ MemberAvatar: () => null }));
vi.mock("./member-look-fields", () => ({ MemberLookFields: () => null }));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Section: wrapper, NumberField: () => null, Body: wrapper, Disclosure: wrapper, NavigationGroup: wrapper, Stack: wrapper, Heading: wrapper,
    Notice: () => null, ErrorText: () => null, MutationState: () => null,
    SelectField: ({ label, onChange }: { label: string; onChange: (text: string) => void }) => { state.fields.set(label, onChange); return null; }, MultiSelectField: () => null,
    Button: () => null, ToggleField: () => null, NavigationRow: () => null, Sheet: () => null,
    Field: ({ label, onChangeText }: { label: string; onChangeText: (text: string) => void }) => { state.fields.set(label, onChangeText); return null; },
    FormActions: ({ disabled, onSubmit }: { disabled: boolean; onSubmit: () => void }) => { state.submit = disabled ? undefined : onSubmit; return null; },
  };
});
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); state.activeId = "pc"; state.machine = { id: "pc", capabilities: ["crews.v1", "crews.tasks.v1"] }; root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks(); state.fields.clear(); vi.unstubAllGlobals(); });

it("retains local crew draft and opening conflict token across parent polling", async () => {
  const original = validCrew();
  original.agents[0].modelChoice = { kind: "pool", poolId: "review-models" };
  const close = vi.fn();
  const render = (initial = original) => root.render(createElement(CrewEditor, { initial, projectId: "project", directory: { definitions: [], agents: [], runs: [] }, onClose: close }));
  await act(async () => render());
  expect(state.fields.has("Allocation preference")).toBe(false);
  expect(state.fields.has("Estimated cost limit (optional)")).toBe(false);
  await act(async () => state.fields.get("Crew name")!("My local crew"));
  await act(async () => render({ ...original, updatedAt: 99, name: "Remote rename", policy: { ...original.policy, maxParallel: 4 } }));
  act(() => state.submit!());
  const submitted = state.mutate.mock.calls[0][0];
  expect(submitted).toMatchObject({ projectId: "project", expectedUpdatedAt: 10, definition: { name: "My local crew", policy: { maxParallel: 2 } } });
  expect(close).not.toHaveBeenCalled();
  expect(submitted.definition.agents).toEqual(original.agents);
});

it("starts once with a stable request ID and requires the actual execution capability", async () => {
  const render = () => root.render(createElement(StartCrewEditor, { definition: validCrew(), projectId: "project", onClose: vi.fn() }));
  await act(async () => render());
  await act(async () => state.fields.get("Desired crew delivery")!("Deliver this"));
  const firstSubmit = state.submit!;
  act(() => { firstSubmit(); firstSubmit(); });
  expect(state.mutate).toHaveBeenCalledTimes(1);
  expect(state.mutate.mock.calls[0][0]).toEqual({ projectId: "project", definitionId: "crew", prompt: "Deliver this", requestId: "stable-request" });
  await act(async () => render());
  expect(state.submit).toBeUndefined();
});

it("blocks writes when the machine changes or crew execution is unsupported", async () => {
  state.machine.capabilities = ["crews.v1"];
  await act(async () => root.render(createElement(StartCrewEditor, { definition: validCrew(), projectId: "project", onClose: vi.fn() })));
  await act(async () => state.fields.get("Desired crew delivery")!("Deliver this"));
  expect(state.submit).toBeUndefined();
  state.machine = { id: "other", capabilities: ["crews.v1", "crews.tasks.v1"] };
  state.activeId = "other";
  await act(async () => root.render(createElement(StartCrewEditor, { definition: validCrew(), projectId: "project", onClose: vi.fn() })));
  expect(state.submit).toBeUndefined();
  expect(state.mutate).not.toHaveBeenCalled();
});

it("binds assignment identity and explicit scope to one machine and suppresses duplicate submit", async () => {
  const run = { id: "run", projectId: "project", status: "active", definition: validCrew(), assignments: [] } as unknown as CrewRunView;
  await act(async () => root.render(createElement(CrewAssignmentEditor, { run, onClose: vi.fn() })));
  await act(async () => {
    state.fields.get("Assigned member")!("crew-worker");
    state.fields.get("Task title")!("Inspect layout");
    state.fields.get("Task instructions")!("Verify the selected screen");
    state.fields.get("Write scopes (project path per line)")!("src/features/layout");
  });
  const submit = state.submit!;
  state.activeId = "other";
  act(() => submit());
  expect(state.mutate).not.toHaveBeenCalled();
  state.activeId = "pc";
  act(() => { submit(); submit(); });
  expect(state.mutate).toHaveBeenCalledTimes(1);
  expect(state.mutate.mock.calls[0][0]).toMatchObject({ projectId: "project", runId: "run", requestId: "stable-request", files: ["src/features/layout"], memberId: "crew-worker" });
});
