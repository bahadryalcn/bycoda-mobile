// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MemberEditor } from "./member-editor";
import type { CrewAgent } from "@/remote/contracts/crews";

const state = vi.hoisted(() => ({
  fields: new Map<string, { label?: string; value?: string; onChange?: (value: string) => void; onChangeText?: (value: string) => void; options?: { value: string; label: string }[] }>(),
  openInstructions: undefined as (() => void) | undefined,
  submit: undefined as (() => void) | undefined,
  read: vi.fn(),
  choice: undefined as undefined | { value?: unknown; role: string; fallbackOpen?: boolean; onChange: (value: unknown) => void },
  fixed: undefined as undefined | { value: { harness: string; model: string }; onChange: (value: unknown) => void },
}));
vi.mock("../../workspace/model-selection/model-choice-field", () => ({
  ModelChoiceField: (props: NonNullable<typeof state.choice> & { fixed: import("react").ReactNode }) => { state.choice = props; return props.fixed; },
}));
vi.mock("../../workspace/model-selection/model-selection-field", () => ({
  FixedModelField: (props: NonNullable<typeof state.fixed>) => { state.fixed = props; return null; },
}));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "pc", capabilities: ["models.routing.v1"] }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (...args: unknown[]) => { state.read(...args); return { data: { version: 3, entries: [], pools: [{ id: "team", name: "Team pool", entryIds: [] }], roles: { "crew.member": { kind: "pool", poolId: "team" } } }, isError: false }; } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("./member-look-fields", () => ({ MemberLookFields: () => null }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const field = (props: { label: string }) => { state.fields.set(props.label, props); return null; };
  return { Body: wrapper, Stack: wrapper, Heading: wrapper, Section: wrapper, Disclosure: wrapper, Notice: () => null,
    NavigationRow: ({ onPress }: { onPress: () => void }) => { state.openInstructions = onPress; return null; },
    Input: field, Sheet: wrapper, Button: () => null, ErrorText: () => null, StatusLine: () => null, Field: field, SelectField: field, MultiSelectField: field,
    FormActions: ({ disabled, onSubmit }: { disabled: boolean; onSubmit: () => void }) => { state.submit = disabled ? undefined : onSubmit; return null; } };
});
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; state.fields.clear(); state.read.mockClear(); vi.unstubAllGlobals(); });
it("puts the member on the shared model selection and preserves its binding on instruction edits until explicitly fixed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  const initial: CrewAgent = { id: "member", name: "Worker", role: "specialist", instructions: "Custom instructions", selection: "automatic", modelChoice: { kind: "pool", poolId: "team" }, candidates: [{ id: "codex/fallback", harness: "codex", model: "fallback", modelSettings: { effort: "high" }, capabilities: {} }] };
  const save = vi.fn();
  await act(async () => root!.render(createElement(MemberEditor, { initial, groupsSupported: false, busy: false, onSave: save, onClose: vi.fn() })));
  expect(state.choice).toMatchObject({ role: "crew.member", value: { kind: "pool", poolId: "team" }, fallbackOpen: false });
  expect(state.fixed?.value).toMatchObject({ harness: "codex", model: "fallback" });
  expect(state.fields.has("Model source")).toBe(false);
  expect(state.fields.has("Instructions")).toBe(false);
  await act(async () => state.openInstructions!());
  await act(async () => state.fields.get("Instructions")!.onChangeText!("Owner edited instructions"));
  act(() => state.submit!());
  expect(save.mock.calls[0][0]).toMatchObject({ instructions: "Owner edited instructions", modelChoice: { kind: "pool", poolId: "team" } });
  expect(save.mock.calls[0][0].candidates).toEqual(initial.candidates);
  await act(async () => state.choice!.onChange({ kind: "fixed" }));
  act(() => state.submit!());
  expect(save.mock.calls[1][0]).toMatchObject({ instructions: "Owner edited instructions", selection: "fixed", modelChoice: { kind: "fixed" } });
});

it("keeps an older automatic member as stored until another mode or model is picked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const initial: CrewAgent = { id: "member", name: "Worker", role: "specialist", instructions: "Do it", selection: "automatic", candidates: [
    { id: "codex/a", harness: "codex", model: "a", modelSettings: {}, capabilities: {} },
    { id: "codex/b", harness: "codex", model: "b", modelSettings: {}, capabilities: {} },
  ] };
  const save = vi.fn();
  await act(async () => root!.render(createElement(MemberEditor, { initial, groupsSupported: false, busy: false, onSave: save, onClose: vi.fn() })));
  expect(state.choice?.value).toBeUndefined();
  // "Fixed" again on an item without a stored choice changes nothing.
  await act(async () => state.choice!.onChange(undefined));
  await act(async () => state.fixed!.onChange({ harness: "claude", model: "opus", providerAccountId: "work", modelSettings: { effort: "low" } }));
  act(() => state.submit!());
  const saved = save.mock.calls[0][0];
  expect(saved.selection).toBe("automatic");
  expect("modelChoice" in saved).toBe(false);
  expect(saved.candidates).toEqual([
    { id: "claude/opus", harness: "claude", model: "opus", providerAccountId: "work", modelSettings: { effort: "low" }, capabilities: {} },
    initial.candidates[1],
  ]);
});
