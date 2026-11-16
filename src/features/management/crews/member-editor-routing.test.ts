// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MemberEditor } from "./member-editor";
import type { CrewAgent } from "@/remote/contracts/crews";

const state = vi.hoisted(() => ({
  fields: new Map<string, { label?: string; value?: string; onChange?: (value: string) => void; onChangeText?: (value: string) => void; options?: { value: string; label: string }[] }>(),
  submit: undefined as (() => void) | undefined,
  read: vi.fn(),
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
    Button: () => null, ErrorText: () => null, Field: field, SelectField: field, MultiSelectField: field,
    FormActions: ({ disabled, onSubmit }: { disabled: boolean; onSubmit: () => void }) => { state.submit = disabled ? undefined : onSubmit; return null; } };
});
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; state.fields.clear(); state.read.mockClear(); vi.unstubAllGlobals(); });
it("exposes public Host routing binding and preserves it on instruction edits until explicitly fixed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  const initial: CrewAgent = { id: "member", name: "Worker", role: "specialist", instructions: "Custom instructions", selection: "automatic", modelChoice: { kind: "pool", poolId: "team" }, candidates: [{ id: "codex/fallback", harness: "codex", model: "fallback", modelSettings: { effort: "high" }, capabilities: {} }] };
  const save = vi.fn();
  await act(async () => root!.render(createElement(MemberEditor, { initial, groupsSupported: false, busy: false, onSave: save, onClose: vi.fn() })));
  expect(state.read.mock.calls[0].slice(0, 3)).toEqual([["modelRouting"], "modelRouting.get", {}]);
  expect(state.fields.get("Model source")?.value).toBe("pool:team");
  expect(state.fields.get("Model source")?.options).toContainEqual({ value: "pool:team", label: "Team pool" });
  expect(state.fields.has("Allowed models")).toBe(false);
  expect((state.fields.get("Model source") as { hint?: string }).hint).toContain("not an allowed-model filter");
  await act(async () => state.fields.get("Instructions")!.onChangeText!("Owner edited instructions"));
  act(() => state.submit!());
  expect(save.mock.calls[0][0]).toMatchObject({ instructions: "Owner edited instructions", modelChoice: { kind: "pool", poolId: "team" } });
  expect(save.mock.calls[0][0].candidates).toEqual(initial.candidates);
  await act(async () => state.fields.get("Model source")!.onChange!("fixed"));
  act(() => state.submit!());
  expect(save.mock.calls[1][0]).toMatchObject({ instructions: "Owner edited instructions", selection: "fixed", modelChoice: { kind: "fixed" } });
});
