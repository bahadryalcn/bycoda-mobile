// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ShellProfileSettings } from "./shell-profile-settings";
const state = vi.hoisted(() => ({ machine: "one", environmentId: "host-one", endpoint: "https://original.example", supported: true, conflict: false, reply: undefined as undefined | Promise<unknown>, refetch: vi.fn(), chosenId: null as string | null, uncertain: false, writes: [] as unknown[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.machine, name: "Computer", environmentId: state.environmentId, endpoint: state.endpoint, capabilities: state.supported ? ["shell.profile.compare.v1"] : [] }), useMachines: { getState: () => ({ activeId: state.machine, machines: [{ id: state.machine, environmentId: state.environmentId, endpoint: state.endpoint, capabilities: state.supported ? ["shell.profile.compare.v1"] : [] }] }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: { profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: state.chosenId }, refetch: state.refetch }),
  useHostMutation: () => ({ isPending: false, mutateAsync: async (input: unknown) => { state.writes.push(input); if (state.conflict) throw new Error("The command shell preference changed. Refresh and review again."); if (state.uncertain) throw { uncertain: true }; if (state.reply) return state.reply; return { profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: "sh" }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return { Stack: Wrapper, Body: Wrapper, Disclosure: Wrapper, Sheet: ({ children, onClose, dismissible }: PropsWithChildren<{ onClose: () => void; dismissible?: boolean }>) => createElement("div", null, children, createElement(Button, { label: "Close shell", disabled: dismissible === false, onPress: onClose })), QueryState: () => null, ErrorText: () => null, MutationState: () => null,
    NavigationRow: Button,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    SelectField: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => createElement("select", { value, disabled, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) }, createElement("option", { value: "" }, "Default"), createElement("option", { value: "sh" }, "Shell")),
    FormActions: ({ submitLabel, onSubmit, disabled }: { submitLabel: string; onSubmit: () => void; disabled: boolean }) => createElement(Button, { label: submitLabel, onPress: onSubmit, disabled }),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let node: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); } await act(async () => root!.render(createElement(ShellProfileSettings))); }
async function click(label: string) { await act(async () => [...node.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function choose() { await act(async () => { const select = node.querySelector("select")!; select.value = "sh"; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); state.machine = "one"; state.environmentId = "host-one"; state.endpoint = "https://original.example"; state.supported = true; state.conflict = false; state.reply = undefined; state.refetch.mockReset(); state.chosenId = null; state.uncertain = false; state.writes = []; vi.unstubAllGlobals(); });
it("sends only the explicitly selected shell with the frozen reviewed preference", async () => {
  await render(); await click("Command shell"); await choose(); expect(state.writes).toEqual([]);
  state.chosenId = "external"; await render(); await click("Save command shell");
  expect(state.writes).toEqual([{ profile: "sh", expectedChosenId: null }]);
  await click("Save command shell"); expect(state.writes).toHaveLength(1);
});
it("does not revive a selection after switching away and back", async () => {
  await render(); await click("Command shell"); await choose(); state.machine = "other"; await render(); await click("Save command shell"); expect(state.writes).toEqual([]);
  state.machine = "one"; await render(); await click("Save command shell"); expect(state.writes).toEqual([]);
});
it("never resends an uncertain save", async () => {
  await render(); await click("Command shell"); await choose(); state.uncertain = true;
  await click("Save command shell"); await click("Save command shell"); expect(state.writes).toHaveLength(1); expect(node.textContent).toContain("outcome is unknown");
});
it("does not apply the reviewed preference to a replacement host with the same machine id", async () => {
  await render(); await click("Command shell"); await choose(); state.environmentId = "replacement-host"; await render();
  await click("Save command shell"); expect(state.writes).toEqual([]);
});

it("retires the same machine's selection after its endpoint changes and returns", async () => {
  await render(); await click("Command shell"); await choose(); state.endpoint = "https://replacement.example"; await render();
  state.endpoint = "https://original.example"; await render(); await click("Save command shell"); expect(state.writes).toEqual([]);
});
it("does not refresh or report success for a late reply after changing computers", async () => {
  let reply!: (value: unknown) => void; state.reply = new Promise(resolve => { reply = resolve; });
  await render(); await click("Command shell"); await choose(); await click("Save command shell");
  state.endpoint = "https://replacement.example"; await render(); await act(async () => reply({ profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: "sh" }));
  expect(state.refetch).not.toHaveBeenCalled(); expect(node.textContent).not.toContain("Command shell saved.");
});
it("keeps the selection uncertain when the host replies with a different saved preference", async () => {
  state.reply = Promise.resolve({ profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: null });
  await render(); await click("Command shell"); await choose(); await click("Save command shell"); await click("Save command shell");
  expect(state.writes).toHaveLength(1); expect(state.refetch).not.toHaveBeenCalled(); expect(node.textContent).toContain("outcome is unknown");
});
it("retains the open selection and explains a lost shell capability", async () => {
  await render(); await click("Command shell"); await choose(); state.supported = false; await render();
  expect(node.querySelector("select")!.value).toBe("sh"); await click("Save command shell"); expect(state.writes).toEqual([]);
  expect(node.textContent).toContain("Update bycoda on this computer to change the command shell.");
});

it("allows explicit uncertain dismissal and refreshes the preference before another review", async () => {
  await render(); await click("Command shell"); await choose(); state.uncertain = true; await click("Save command shell");
  await click("Close shell"); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.writes).toHaveLength(1); expect(node.querySelector("select")).toBeNull();
});

it("refreshes after closing a known preference conflict so the next review can use current choices", async () => {
  await render(); await click("Command shell"); await choose(); state.conflict = true; await click("Save command shell");
  await click("Close shell"); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.writes).toHaveLength(1);
});
