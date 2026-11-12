// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  endpoint: "https://original.example", supported: true,
  settings: { maxRunningTasks: 2, dailyAgentMinutes: 120, usedMinutes: 42.5, limitReached: false },
  write: vi.fn(), refetch: vi.fn(), reads: [] as boolean[], error: undefined as unknown,
}));
const machine = () => ({ id: "machine", name: "Original computer", environmentId: "host", endpoint: state.endpoint, capabilities: state.supported ? ["host.settings"] : [] });
vi.mock("@/state/machines", () => ({ useActiveMachine: () => machine(), useMachines: { getState: () => ({ activeId: "machine", machines: [machine()] }) } }));
vi.mock("@/state/queries", () => ({
  hostKey: (id: string, key: string[]) => ["machine", id, ...key],
  useHostQuery: (_key: unknown, _method: string, _params: unknown, options: { enabled: boolean }) => { state.reads.push(options.enabled); return { data: (state.error as { kind?: string })?.kind === "auth" ? undefined : state.settings, error: state.error, isError: !!state.error, refetch: state.refetch }; },
  useHostMutation: () => ({ mutateAsync: state.write, isPending: false }),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) } }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("./shell-profile-settings", () => ({ ShellProfileSettings: () => null }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (action: () => void) => action() }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label);
  return { Stack: Wrap, Body: Wrap, Disclosure: Wrap, Button,
    QueryState: ({ query }: { query: { error?: Error } }) => query.error ? createElement("p", null, query.error.message) : null,
    ErrorText: ({ error }: { error?: string | Error }) => error ? createElement("p", null, String(error)) : null,
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) => createElement("div", null, createElement("p", null, title), description ? createElement("p", null, description) : null, action ? createElement("button", { onClick: action.onPress }, action.label) : null), Notice: ({ message }: { message: string }) => createElement("p", null, message),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: import("@/ui/component-props").FormActionsProps) => createElement("section", null, feedback, createElement(Button, { label: submitLabel, disabled, busy, onPress: onSubmit })),
    MutationState: ({ mutation, success }: { mutation: { error?: Error; isSuccess?: boolean }; success: string }) => createElement("p", null, mutation.error?.message ?? (mutation.isSuccess ? success : null)),
    NumberField: ({ label, value, editable, onChangeText }: { label: string; value: string; editable?: boolean; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, disabled: editable === false, onChange: (e: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value) }),
  };
});
import { HostSettingsEditor } from "./host-settings-editor";
let root: ReturnType<typeof createRoot> | undefined, node: HTMLDivElement, cache: QueryClient;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); }
  await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(HostSettingsEditor, { machineId: "machine" }))));
}
async function edit(value: string) { await act(async () => { const input = node.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function click(label: string) { await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
const save = () => click("Save computer settings");
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); cache?.clear(); state.endpoint = "https://original.example"; state.supported = true; state.settings = { maxRunningTasks: 2, dailyAgentMinutes: 120, usedMinutes: 42.5, limitReached: false }; state.error = undefined; state.reads = []; vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("saves only the explicit draft and preserves newer edits during acknowledgement", async () => {
  let resolve!: (result: unknown) => void; state.write.mockImplementation(() => new Promise(reply => { resolve = reply; }));
  await render(); await edit("3"); await save(); expect(state.write).toHaveBeenCalledWith({ settings: { maxRunningTasks: 3, dailyAgentMinutes: 120 } });
  await edit("4"); await act(async () => { resolve({ ...state.settings, maxRunningTasks: 3 }); await new Promise(done => setTimeout(done, 0)); });
  expect(node.querySelector("input")!.value).toBe("4"); expect(node.textContent).toContain("newer edits are not saved yet");
});
it("retains the original draft and never revives it on a replacement connection", async () => {
  await render(); await edit("3"); state.endpoint = "https://replacement.example"; state.settings = { ...state.settings, maxRunningTasks: 8 }; await render();
  expect(node.querySelector("input")!.value).toBe("3"); expect(node.querySelector("input")!.disabled).toBe(true);
  state.endpoint = "https://original.example"; await render(); await save(); expect(state.write).not.toHaveBeenCalled(); expect(node.textContent).toContain("selected computer changed");
});
it("ignores a late old-target success without clearing the draft or writing its cache", async () => {
  let resolve!: (result: unknown) => void; state.write.mockImplementation(() => new Promise(reply => { resolve = reply; }));
  await render(); await edit("3"); await save(); const update = vi.spyOn(cache, "setQueriesData");
  state.endpoint = "https://replacement.example"; await render(); await act(async () => resolve({ ...state.settings, maxRunningTasks: 3 }));
  expect(update).not.toHaveBeenCalled(); expect(node.querySelector("input")!.value).toBe("3"); expect(node.textContent).not.toContain("Computer settings saved.");
});
it("blocks uncertain resend, reads the current result, and retains the unsent draft", async () => {
  state.write.mockRejectedValue(Object.assign(new Error("transport interrupted"), { uncertain: true }));
  state.refetch.mockResolvedValue({ data: state.settings, isError: false });
  await render(); await edit("3"); await save(); expect([...node.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Refresh"]); expect(state.write).toHaveBeenCalledOnce();
  await click("Refresh"); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.write).toHaveBeenCalledOnce(); expect(node.querySelector("input")!.value).toBe("3"); expect(node.querySelector("input")!.disabled).toBe(false); expect(node.textContent).toContain("Last received limits:");
});
it.each([null, { maxRunningTasks: 8, dailyAgentMinutes: 120, usedMinutes: 0, limitReached: false }])("does not claim a mismatched or malformed write reply was saved", async reply => {
  state.write.mockResolvedValue(reply); await render(); await edit("3"); await save(); expect([...node.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Refresh"]);
  expect(state.write).toHaveBeenCalledOnce(); expect(node.querySelector("input")!.value).toBe("3"); expect(node.textContent).toContain("outcome is unknown");
});
it("does not read or expose task fields without host-settings support", async () => {
  state.supported = false; await render(); expect(state.reads.every(enabled => !enabled)).toBe(true); expect(node.querySelector("input")).toBeNull(); expect(node.textContent).toContain("edit task limits");
});
it("retains editable cached drafts but blocks saving after a failed refresh", async () => {
  await render(); await edit("3"); state.error = new Error("read failed"); await render(); await edit("4"); await save(); expect(state.write).not.toHaveBeenCalled(); expect(node.querySelector("input")!.value).toBe("4");
});

it("hides cached limits on lost authorization while retaining the unsent draft for recovery", async () => {
  await render(); await edit("3"); state.error = Object.assign(new Error("authorization lost"), { kind: "auth" }); await render();
  expect(node.querySelector("input")).toBeNull(); expect(node.textContent).not.toContain("42.5 minutes used today");
  state.error = undefined; await render(); expect(node.querySelector("input")!.value).toBe("3"); expect(state.write).not.toHaveBeenCalled();
});
