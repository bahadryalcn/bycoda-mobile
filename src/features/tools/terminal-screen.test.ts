// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
const fixture = vi.hoisted(() => ({
  machineId: "computer", endpoint: "https://synthetic.invalid", environmentId: "environment", lanKey: "synthetic", projectId: "project", rows: [] as any[],
  writable: true, paused: false, output: "Output\n".repeat(2000), client: {} as any, request: vi.fn(), listRead: vi.fn(), outputRead: vi.fn(),
  refresh: undefined as any, blockedLeave: false, submit: undefined as any,
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock("expo-router/react-navigation", () => ({ useNavigation: () => ({ dispatch: vi.fn() }), usePreventRemove: (blocked: boolean) => { fixture.blockedLeave = blocked; } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "synthetic-request-id" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: fixture.machineId, endpoint: fixture.endpoint, environmentId: fixture.environmentId, lanKey: fixture.lanKey, name: "Computer" });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: fixture.machineId, machines: [machine()] }) } };
});
vi.mock("@/state/queries", () => ({ useHostClient: () => fixture.client, useHostQuery: () => ({
  data: fixture.paused ? undefined : { terminals: fixture.rows, profiles: [], writable: fixture.writable }, isSuccess: !fixture.paused,
  fetchStatus: fixture.paused ? "paused" : "idle", isPending: fixture.paused, refetch: fixture.listRead,
}) }));
vi.mock("./use-terminal-output", () => ({ useTerminalOutput: (_client: any, projectId: string, id: string) => ({
  data: id ? { terminal: fixture.rows.find(row => row.id === id), output: fixture.output, cursor: 1 } : undefined,
  refetch: fixture.outputRead,
}) }));
vi.mock("@/state/actions", async () => {
  const { useState } = await import("react");
  return { useAsyncAction: () => {
    const [isPending, setPending] = useState(false), [error, setError] = useState<unknown>();
    return { isPending, error, reset: () => setError(undefined), run: async (fn: () => Promise<unknown>) => {
      setPending(true); try { return await fn(); } catch (e) { setError(e); } finally { setPending(false); }
    } };
  } };
});
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title }: any) => createElement("p", null, title), Notice: ({ message }: any) => createElement("p", null, message),
  ErrorNotice: () => null, Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, busy, onPress }: any) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label);
  return { QueryState, Body: Group, Badge: ({ label }: any) => createElement("span", null, label), Row: Group, Disclosure: Group, CodePanel: Group, CodeText: ({ children }: any) => createElement("pre", null, children), Button, IconButton: Button, NavigationRow: Button,
    Notice: ({ message, children }: any) => createElement("div", null, message, children),
    MutationState: ({ mutation }: any) => mutation.error ? createElement("p", { role: "alert" }, String(mutation.error.message)) : null,
    Field: ({ label, value, editable, onChangeText, error }: any) => createElement("label", null, error, createElement("input", { "aria-label": label, value, disabled: !editable, onChange: (e: any) => onChangeText(e.target.value) })),
    ActionMenu: ({ actions }: any) => createElement("div", null, actions.map((a: any) => createElement(Button, { key: a.key, ...a }))),
    FormActions: ({ submitLabel, disabled, busy, onSubmit, feedback, onCancel }: any) => { fixture.submit = onSubmit; return createElement("div", null, feedback, createElement(Button, { label: submitLabel, disabled, busy, onPress: onSubmit }), onCancel ? createElement(Button, { label: "Cancel", onPress: onCancel }) : null); },
    SelectField: ({ label, value, options, disabled, onChange }: any) => createElement("select", { "aria-label": label, value, disabled, onChange: (e: any) => onChange(e.target.value) }, createElement("option", { value: "" }, "Choose"), options.map((o: any) => createElement("option", { value: o.value, key: o.value }, o.label))),
    Sheet: ({ visible, title, children, dismissible, onClose }: any) => visible ? createElement("aside", { "data-title": title }, children, createElement(Button, { label: `Close ${title}`, disabled: dismissible === false, onPress: onClose })) : null,
    Screen: ({ children, actions, footer, refreshState }: any) => { fixture.refresh = refreshState; return createElement("main", null, createElement("section", { "data-page-scroll": true }, actions, children), createElement("footer", null, footer)); },
  };
});
import { TerminalScreen } from "./terminal-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(() => root.render(createElement(TerminalScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const button = (label: string) => [...node.querySelectorAll("button")].find(b => b.textContent === label)!;
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(() => button(label).click()); };
const select = async (id: string) => { const field = node.querySelector('select[aria-label="Terminal"]') as HTMLSelectElement; await act(() => { field.value = id; field.dispatchEvent(new Event("change", { bubbles: true })); }); };
const input = async (value: string) => { const field = node.querySelector('input[aria-label="Command"]')!; await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); fixture.machineId = "computer"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "environment"; fixture.lanKey = "synthetic"; fixture.projectId = "project"; fixture.writable = true; fixture.paused = false;
  fixture.rows = ["one", "two"].map(id => ({ id, projectId: "project", name: id, cwd: "/project", state: "running" }));
  fixture.request.mockReset().mockResolvedValue({ accepted: true }); fixture.client = { machine: { id: fixture.machineId, endpoint: fixture.endpoint, environmentId: fixture.environmentId, lanKey: fixture.lanKey }, request: fixture.request };
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
it("keeps the command action outside long output, preserves per-terminal drafts on close, and sends only explicitly", async () => {
  await render(); await select("one"); expect(node.querySelector("pre")!.textContent).toBe(fixture.output); expect(node.querySelector("footer button")!.textContent).toBe("Command");
  await click("Command"); await input("printf kept"); await click("Close Command"); expect(fixture.blockedLeave).toBe(true);
  await select("two"); await click("Command"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe(""); await click("Close Command");
  await select("one"); await click("Command"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf kept"); expect(fixture.request).not.toHaveBeenCalled();
  await click("Send command"); expect(fixture.request).toHaveBeenCalledWith("terminals.write", { projectId: "project", id: "one", data: "printf kept\n" }, { retry: false });
  expect(node.querySelector("aside")).toBeNull(); await click("Command"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("");
});
it.each(["machine", "endpoint", "environment", "key", "project"])("rejects a stale command after a %s change and starts a separate target owner", async kind => {
  await render(); await select("one"); await click("Command"); await input("printf previous");
  const staleSubmit = fixture.submit;
  if (kind === "machine") fixture.machineId = "other";
  if (kind === "endpoint") fixture.endpoint = "https://repaired.invalid";
  if (kind === "environment") fixture.environmentId = "other";
  if (kind === "key") fixture.lanKey = "other-synthetic";
  if (kind === "project") fixture.projectId = "other-project";
  if (kind === "project") await render();
  await act(() => staleSubmit()); expect(fixture.request).not.toHaveBeenCalled();
  await render(); expect(node.querySelector("aside")).toBeNull(); expect(fixture.blockedLeave).toBe(false);
});
it("keeps a draft and editor through replacement of the same target's client", async () => {
  await render(); await select("one"); await click("Command"); await input("printf retained"); fixture.client = { ...fixture.client }; await render();
  expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf retained"); expect(fixture.request).not.toHaveBeenCalled();
});
it("recovers a removed terminal's unsent draft as read-only without retargeting another terminal", async () => {
  await render(); await select("one"); await click("Command"); await input("recover this draft"); await click("Close Command"); fixture.rows = fixture.rows.filter(row => row.id !== "one"); await render();
  await select("two"); await click("one"); expect(node.querySelector("aside pre")!.textContent).toBe("recover this draft"); expect(button("Send command").disabled).toBe(true); expect(fixture.request).not.toHaveBeenCalled();
});
it("does not submit a stop review when its terminal disappears", async () => {
  await render(); await select("one"); await click("Stop terminal"); fixture.rows = fixture.rows.filter(row => row.id !== "one"); await render();
  expect(button("Stop terminal").disabled).toBe(true); await click("Stop terminal"); expect(fixture.request).not.toHaveBeenCalled();
});
it("retains an uncertain command, owns its feedback once and never retries automatically", async () => {
  fixture.request.mockRejectedValueOnce(Object.assign(new Error("Synthetic uncertain write"), { uncertain: true }));
  await render(); await select("one"); await click("Command"); await input("printf uncertain"); await click("Send command");
  expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1); expect(button("Send command").disabled).toBe(true);
  expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf uncertain"); await click("Close Command");
  expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1); await click("Refresh"); await click("I checked the result"); expect(fixture.request).toHaveBeenCalledOnce();
});
it("shares toolbar and pull reads while distinguishing a paused list from an empty success", async () => {
  await render(); await fixture.refresh.onRefresh(); expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.outputRead).toHaveBeenCalledOnce();
  fixture.paused = true; await render(); expect(node.textContent).not.toContain("No terminals in this project.");
});
