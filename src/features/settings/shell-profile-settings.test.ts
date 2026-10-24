// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ShellProfileSettings } from "./shell-profile-settings";
const state = vi.hoisted(() => ({ machine: "one", environmentId: "host-one", chosenId: null as string | null, uncertain: false, writes: [] as unknown[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.machine, name: "Computer", environmentId: state.environmentId, capabilities: ["shell.profile.compare.v1"] }), useMachines: { getState: () => ({ activeId: state.machine, machines: [{ id: state.machine, environmentId: state.environmentId }] }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: { profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: state.chosenId }, refetch: vi.fn() }),
  useHostMutation: () => ({ isPending: false, mutateAsync: async (input: unknown) => { state.writes.push(input); if (state.uncertain) throw { uncertain: true }; return { profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: "sh" }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return { Stack: Wrapper, Body: Wrapper, Sheet: Wrapper, QueryState: () => null, ErrorText: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    SelectField: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => createElement("select", { value, disabled, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) }, createElement("option", { value: "" }, "Default"), createElement("option", { value: "sh" }, "Shell")),
    FormActions: ({ submitLabel, onSubmit, disabled }: { submitLabel: string; onSubmit: () => void; disabled: boolean }) => createElement(Button, { label: submitLabel, onPress: onSubmit, disabled }),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let node: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); } await act(async () => root!.render(createElement(ShellProfileSettings))); }
async function click(label: string) { await act(async () => [...node.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function choose() { await act(async () => { const select = node.querySelector("select")!; select.value = "sh"; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); state.machine = "one"; state.environmentId = "host-one"; state.chosenId = null; state.uncertain = false; state.writes = []; vi.unstubAllGlobals(); });
it("sends only the explicitly selected shell with the frozen reviewed preference", async () => {
  await render(); await click("Command shell"); await choose(); expect(state.writes).toEqual([]);
  state.chosenId = "external"; await render(); await click("Save command shell");
  expect(state.writes).toEqual([{ profile: "sh", expectedChosenId: null }]);
  await click("Save command shell"); expect(state.writes).toHaveLength(1);
});
it("refuses a changed machine and never resends an uncertain save", async () => {
  await render(); await click("Command shell"); await choose(); state.machine = "other"; await render(); await click("Save command shell"); expect(state.writes).toEqual([]);
  state.machine = "one"; state.uncertain = true; await render(); await click("Save command shell"); await click("Save command shell");
  expect(state.writes).toHaveLength(1); expect(node.textContent).toContain("outcome is unknown");
});
it("does not apply the reviewed preference to a replacement host with the same machine id", async () => {
  await render(); await click("Command shell"); await choose(); state.environmentId = "replacement-host"; await render();
  await click("Save command shell"); expect(state.writes).toEqual([]);
});
