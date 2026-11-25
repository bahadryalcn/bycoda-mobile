// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  endpoint: "https://original.example", supported: true,
  disconnected: false, pending: false, checking: false,
  deviceOffline: false, recovering: false, recoveryElapsed: false,
  settings: { maxRunningTasks: 2, dailyAgentMinutes: 120, usedMinutes: 42.5, limitReached: false },
  write: vi.fn(), refetch: vi.fn(), reads: [] as boolean[], error: undefined as unknown,
}));
const machine = () => ({ id: "machine", name: "Original computer", environmentId: "host", endpoint: state.endpoint, capabilities: state.supported ? ["host.settings"] : [] });
vi.mock("@/state/machines", () => ({ useActiveMachine: () => machine(), useMachines: { getState: () => ({ activeId: "machine", machines: [machine()] }) } }));
vi.mock("@/state/queries", () => ({
  hostKey: (id: string, key: string[]) => ["machine", id, ...key],
  useHostQuery: (_key: unknown, _method: string, _params: unknown, options: { enabled: boolean }) => { state.reads.push(options.enabled); return { data: state.pending || (state.error as { kind?: string })?.kind === "auth" ? undefined : state.settings, isPending: state.pending, error: state.error, isError: !!state.error, refetch: state.refetch }; },
  useHostMutation: () => ({ mutateAsync: state.write, isPending: false }),
}));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/state/device-network", () => ({ useDeviceOffline: () => state.deviceOffline }));
vi.mock("@/state/host-runtime-state", () => ({
  useActiveHostLinkDown: () => state.disconnected,
  useActiveHostRecoveryMachine: () => state.recovering ? "machine" : null,
}));
vi.mock("@/ui/query-state", () => ({ useReadRetryNotice: (recovering: boolean) => recovering && state.recoveryElapsed }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: state.checking ? "checking" : state.disconnected ? "disconnected" : "connected" }) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) } }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("./shell-profile-settings", () => ({ ShellProfileSettings: () => "Shell settings" }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (action: () => void) => action() }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: { p0?: string }) => en.replace("{p0}", values?.p0 ?? "{p0}") }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/integer-stepper", () => ({
  IntegerStepper: ({ value, onValueChange, disabled }: { value: number; onValueChange: (value: number) => void; disabled?: boolean }) =>
    createElement("div", null, createElement("output", null, value),
      createElement("button", { disabled, onClick: () => onValueChange(value - 1) }, "Decrease concurrent tasks"),
      createElement("button", { disabled, onClick: () => onValueChange(value + 1) }, "Increase concurrent tasks")),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label);
  return { Stack: Wrap, Body: Wrap, Disclosure: Wrap, SectionHeader: Wrap, Button,
    Loading: ({ label }: { label: string }) => createElement("p", null, label),
    QueryState: ({ query }: { query: { error?: Error } }) => query.error ? createElement("p", null, query.error.message) : null,
    ErrorText: ({ error }: { error?: string | Error }) => error ? createElement("p", null, String(error)) : null,
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) => createElement("div", null, createElement("p", null, title), description ? createElement("p", null, description) : null, action ? createElement("button", { onClick: action.onPress }, action.label) : null), Notice: ({ message }: { message: string }) => createElement("p", null, message),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: import("@/ui/component-props").FormActionsProps) => createElement("section", null, feedback, createElement(Button, { label: submitLabel, disabled, busy, onPress: onSubmit })),
    MutationState: ({ mutation, success }: { mutation: { error?: Error; isSuccess?: boolean }; success: string }) => createElement("p", null, mutation.error?.message ?? (mutation.isSuccess ? success : null)),
    NumberField: ({ label, value, editable, onChangeText }: { label: string; value: string; editable?: boolean; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, disabled: editable === false, onChange: (e: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value) }),
    SelectField: ({ label, value, options, placeholder, disabled, onChange }: { label: string; value: string | undefined; placeholder?: string; options: { value: string; label: string }[]; disabled?: boolean; onChange: (value: string) => void }) =>
      createElement("select", { "aria-label": label, value: value ?? "", disabled, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) },
        placeholder ? createElement("option", { value: "", disabled: true }, placeholder) : null,
        options.map(option => createElement("option", { key: option.value, value: option.value }, option.label))),
  };
});
import { HostSettingsEditor } from "./host-settings-editor";
let root: ReturnType<typeof createRoot> | undefined, node: HTMLDivElement, cache: QueryClient;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); }
  await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(HostSettingsEditor, { machineId: "machine" }))));
}
async function click(label: string) { await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
const increase = () => click("Increase concurrent tasks");
const decrease = () => click("Decrease concurrent tasks");
const taskLimit = () => node.querySelector("output");
const taskLimitDisabled = () => [...node.querySelectorAll("button")].find(button => button.textContent === "Increase concurrent tasks")?.disabled;
const dailyLimit = () => node.querySelector<HTMLSelectElement>('select[aria-label="Daily agent time"]')!;
const enabledActions = () => [...node.querySelectorAll("button:not(:disabled)")].map(button => button.textContent);
const save = () => click("Save computer settings");
it("offers one recovery action when opened with an unreachable computer", async () => {
  state.disconnected = true;
  try {
    await render();
    expect(node.textContent).toContain("Can't reach Original computer on this network.");
    expect(node.textContent).not.toContain("Shell settings");
    expect(taskLimit()).toBeNull();
    expect(state.reads).toEqual([false]);
  } finally {
    state.disconnected = false;
  }
});
it("shows checking during a brief automatic recovery and escalates a sustained outage", async () => {
  state.disconnected = state.recovering = true;
  try {
    await render();
    expect(node.textContent).toContain("Checking connection…");
    expect(node.textContent).not.toContain("Can't reach");
    state.recoveryElapsed = true; await render();
    expect(node.textContent).toContain("Can't reach Original computer on this network.");
  } finally {
    state.disconnected = state.recovering = state.recoveryElapsed = false;
  }
});
it("keeps the draft disabled during a quiet link recovery and reports actual device offline immediately", async () => {
  await render(); await increase();
  state.disconnected = state.recovering = true;
  try {
    await render();
    expect(taskLimit()?.value).toBe("3");
    expect(taskLimitDisabled()).toBe(true);
    expect(enabledActions()).not.toContain("Save computer settings");
    expect(node.textContent).not.toContain("Can't reach");
    state.deviceOffline = true; await render();
    expect(node.textContent).toContain("Can't reach Original computer on this network.");
  } finally {
    state.disconnected = state.recovering = state.deviceOffline = false;
  }
});
it("keeps independent settings available while the task limits load", async () => {
  state.pending = true;
  try {
    await render();
    expect(taskLimit()).toBeNull();
    expect(node.textContent).toContain("Shell settings");
  } finally { state.pending = false; }
});
it("offers only connection recovery if the first connection check fails", async () => {
  state.checking = true;
  state.pending = true;
  try {
    await render();
    expect(node.textContent).toContain("Checking connection…");
    expect(node.textContent).not.toContain("Shell settings");
    state.checking = false;
    state.disconnected = true;
    await render();
    expect(node.textContent).toContain("Can't reach Original computer on this network.");
    expect(node.textContent).not.toContain("Shell settings");
    expect([...node.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Manage connections"]);
  } finally {
    state.checking = false;
    state.pending = false;
    state.disconnected = false;
  }
});
it("keeps a task limit draft through a dropped connection and prevents sending it offline", async () => {
  await render();
  await increase();
  state.disconnected = true;
  try {
    await render();
    expect(taskLimit()?.value).toBe("3");
    expect(taskLimitDisabled()).toBe(true);
    await save();
    expect(state.write).not.toHaveBeenCalled();
    state.disconnected = false;
    await render();
    expect(taskLimit()?.value).toBe("3");
    expect(taskLimitDisabled()).toBe(false);
  } finally {
    state.disconnected = false;
  }
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); cache?.clear(); state.endpoint = "https://original.example"; state.supported = true; state.settings = { maxRunningTasks: 2, dailyAgentMinutes: 120, usedMinutes: 42.5, limitReached: false }; state.error = undefined; state.reads = []; vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("clears the task limit draft when the buttons restore the saved value", async () => {
  await render();
  await increase();
  expect(enabledActions()).toContain("Save computer settings");
  await decrease();
  expect(taskLimit()?.value).toBe("2");
  expect(enabledActions()).not.toContain("Save computer settings");
  await save();
  expect(state.write).not.toHaveBeenCalled();
});
it("preserves a correction to the original limit while saving another value", async () => {
  let finish!: (result: unknown) => void;
  state.write.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await increase(); await save(); await decrease();
  await act(async () => { finish({ ...state.settings, maxRunningTasks: 3 }); });
  state.settings = { ...state.settings, maxRunningTasks: 3 }; await render();
  expect(taskLimit()?.value).toBe("2");
  expect(enabledActions()).toContain("Save computer settings");
});
it("saves only the explicit draft and preserves newer edits during acknowledgement", async () => {
  let resolve!: (result: unknown) => void; state.write.mockImplementation(() => new Promise(reply => { resolve = reply; }));
  await render(); await increase(); await save(); expect(state.write).toHaveBeenCalledWith({ settings: { maxRunningTasks: 3 } });
  await increase(); await act(async () => { resolve({ ...state.settings, maxRunningTasks: 3 }); await new Promise(done => setTimeout(done, 0)); });
  expect(taskLimit()?.value).toBe("4"); expect(node.textContent).toContain("newer edits are not saved yet");
});
it("sends only the edited limit and keeps a limit changed elsewhere after the sheet opened (#1266)", async () => {
  await render(); await increase();
  state.settings = { ...state.settings, dailyAgentMinutes: 300 }; await render();
  expect(dailyLimit().selectedOptions[0].textContent).toBe("5 h");
  state.write.mockResolvedValue({ ...state.settings, maxRunningTasks: 3 }); await save();
  expect(state.write).toHaveBeenCalledOnce(); expect(state.write).toHaveBeenCalledWith({ settings: { maxRunningTasks: 3 } });
  expect(node.textContent).toContain("Computer settings saved."); expect(node.textContent).not.toContain("outcome is unknown");
});
it("sends only the daily minutes when only that field was edited", async () => {
  state.write.mockResolvedValue({ ...state.settings, dailyAgentMinutes: 0 });
  await render();
  expect(node.querySelector("input")).toBeNull();
  await act(async () => { const field = dailyLimit(); field.value = "0"; field.dispatchEvent(new Event("change", { bubbles: true })); });
  await save(); expect(state.write).toHaveBeenCalledWith({ settings: { dailyAgentMinutes: 0 } });
});
it("keeps exact daily minutes available in the custom option", async () => {
  state.write.mockResolvedValue({ ...state.settings, dailyAgentMinutes: 93 });
  await render();
  await act(async () => { const field = dailyLimit(); field.value = "custom"; field.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { const input = node.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "93"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await save(); expect(state.write).toHaveBeenCalledWith({ settings: { dailyAgentMinutes: 93 } });
});
it("keeps the Host range for an existing limit above twenty", async () => {
  state.settings = { ...state.settings, maxRunningTasks: 24 };
  state.write.mockResolvedValue({ ...state.settings, maxRunningTasks: 25 });
  await render();
  expect(taskLimit()?.value).toBe("24");
  await increase();
  await save();
  expect(state.write).toHaveBeenCalledWith({ settings: { maxRunningTasks: 25 } });
});
it("retains the original draft and never revives it on a replacement connection", async () => {
  await render(); await increase(); state.endpoint = "https://replacement.example"; state.settings = { ...state.settings, maxRunningTasks: 8 }; await render();
  expect(taskLimit()?.value).toBe("3"); expect(taskLimitDisabled()).toBe(true);
  expect(node.textContent).not.toContain("Shell settings");
  state.endpoint = "https://original.example"; await render(); await save(); expect(state.write).not.toHaveBeenCalled(); expect(node.textContent).toContain("selected computer changed");
});
it("ignores a late old-target success without clearing the draft or writing its cache", async () => {
  let resolve!: (result: unknown) => void; state.write.mockImplementation(() => new Promise(reply => { resolve = reply; }));
  await render(); await increase(); await save(); const update = vi.spyOn(cache, "setQueriesData");
  state.endpoint = "https://replacement.example"; await render(); await act(async () => resolve({ ...state.settings, maxRunningTasks: 3 }));
  expect(update).not.toHaveBeenCalled(); expect(taskLimit()?.value).toBe("3"); expect(node.textContent).not.toContain("Computer settings saved.");
});
it("blocks uncertain resend, reads the current result, and retains the unsent draft", async () => {
  state.write.mockRejectedValue(Object.assign(new Error("transport interrupted"), { uncertain: true }));
  state.refetch.mockResolvedValue({ data: state.settings, isError: false });
  await render(); await increase(); await save(); expect(enabledActions()).toEqual(["Refresh"]); expect(state.write).toHaveBeenCalledOnce();
  await click("Refresh"); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.write).toHaveBeenCalledOnce(); expect(taskLimit()?.value).toBe("3"); expect(taskLimitDisabled()).toBe(false); expect(node.textContent).toContain("Last received limits:");
});
it.each([null, { maxRunningTasks: 8, dailyAgentMinutes: 120, usedMinutes: 0, limitReached: false }])("does not claim a mismatched or malformed write reply was saved", async reply => {
  state.write.mockResolvedValue(reply); await render(); await increase(); await save(); expect(enabledActions()).toEqual(["Refresh"]);
  expect(state.write).toHaveBeenCalledOnce(); expect(taskLimit()?.value).toBe("3"); expect(node.textContent).toContain("outcome is unknown");
});
it("does not read or expose task fields without host-settings support", async () => {
  state.supported = false; await render(); expect(state.reads.every(enabled => !enabled)).toBe(true); expect(taskLimit()).toBeNull(); expect(node.textContent).toContain("edit task limits");
});
it("retains editable cached drafts but blocks saving after a failed refresh", async () => {
  await render(); await increase(); state.error = new Error("read failed"); await render(); await increase(); await save(); expect(state.write).not.toHaveBeenCalled(); expect(taskLimit()?.value).toBe("4");
});

it("hides cached limits on lost authorization while retaining the unsent draft for recovery", async () => {
  await render(); await increase(); state.error = Object.assign(new Error("authorization lost"), { kind: "auth" }); await render();
  expect(taskLimit()).toBeNull(); expect(node.textContent).not.toContain("42.5 minutes used today");
  state.error = undefined; await render(); expect(taskLimit()?.value).toBe("3"); expect(state.write).not.toHaveBeenCalled();
});
