// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SocialPolicyEditor } from "./policy-settings";
const state = vi.hoisted(() => ({ machine: "one", environmentId: "host-one", uncertain: false, writes: [] as unknown[], confirmations: [] as (() => void)[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.machine, name: "Computer", environmentId: state.environmentId }), useMachines: { getState: () => ({ activeId: state.machine, machines: [{ id: state.machine, environmentId: state.environmentId }] }) } }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({}), useHostMutation: () => ({ isPending: false, mutateAsync: async (input: unknown) => { state.writes.push(input); if (state.uncertain) throw { uncertain: true }; return {}; } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_a: string, _b: string, _c: string, run: () => void) => state.confirmations.push(run) }));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, Sheet: Wrapper, Section: Wrapper, QueryState: () => null, ErrorText: () => null, Button: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    SelectField: () => null,
    Field: ({ value, onChangeText, label, editable }: { value: string; onChangeText: (value: string) => void; label: string; editable: boolean }) => createElement("input", { "aria-label": label, value, disabled: !editable, onInput: (event: import("react").FormEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
    FormActions: ({ submitLabel, onSubmit, disabled }: { submitLabel: string; onSubmit: () => void; disabled: boolean }) => createElement("button", { onClick: onSubmit, disabled }, submitLabel),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let node: HTMLDivElement;
const snapshot = { global: { maxContentCharacters: 100 }, platforms: { x: { maxMessageCharacters: 50 } } };
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); }
  await act(async () => root!.render(createElement(SocialPolicyEditor, { snapshot, scope: "global", machineId: "one", onClose: vi.fn(), onSaved: vi.fn() })));
}
async function edit(text: string) { await act(async () => { const input = node.querySelector<HTMLInputElement>('[aria-label="Post character limit"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => node.querySelector("button")!.click()); }
async function confirm(index = 0) { await act(async () => state.confirmations[index]()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); state.machine = "one"; state.environmentId = "host-one"; state.uncertain = false; state.writes = []; state.confirmations = []; vi.unstubAllGlobals(); });
it("requires a separate owner action and sends the exact reviewed snapshot once", async () => {
  await render(); await edit("200"); await submit(); await submit(); expect(state.writes).toEqual([]);
  await confirm(); await confirm(1);
  expect(state.writes).toEqual([{ action: "policy.saveReviewed", input: { policies: { ...snapshot, global: { maxContentCharacters: 200 } }, expectedPolicies: snapshot, confirm: "UPDATE_SOCIAL_POLICY" } }]);
});
it("refuses confirmation after machine or draft changes and prevents uncertain replay", async () => {
  await render(); await edit("200"); await submit(); state.machine = "other"; await confirm(); expect(state.writes).toEqual([]);
  state.machine = "one"; await edit("300"); await confirm(); expect(state.writes).toEqual([]);
  state.uncertain = true; await submit(); await confirm(1); await submit(); await confirm(1);
  expect(state.writes).toHaveLength(1); expect(node.textContent).toContain("outcome is unknown");
});
it("refuses a replaced host identity even when the saved machine id stays the same", async () => {
  await render(); await edit("200"); await submit(); state.environmentId = "replacement-host";
  await confirm(); expect(state.writes).toEqual([]);
});
