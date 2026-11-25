// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), ScrollView: ({ children }: PropsWithChildren) => createElement("div", null, children), Keyboard: { dismiss: vi.fn() } }));
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { disk.set(key, value); },
  removeItem: async (key: string) => { disk.delete(key); },
} }));
const fixture = vi.hoisted(() => ({
  machineId: "computer", endpoint: "https://synthetic.invalid", environmentId: "environment", lanKey: "synthetic", projectId: "project", rows: [] as any[],
  writable: true, paused: false, output: "Output\n".repeat(2000), client: {} as any, request: vi.fn(), listRead: vi.fn(), outputRead: vi.fn(),
  refresh: undefined as any, blockedLeave: false, submit: undefined as any, copied: "",
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock("expo-router/react-navigation", () => ({ useNavigation: () => ({ dispatch: vi.fn(), setOptions: vi.fn() }), usePreventRemove: (blocked: boolean) => { fixture.blockedLeave = blocked; } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "synthetic-request-id" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("./terminal-header-controls", () => ({
  TerminalStatusDot: () => null,
  TerminalCopyButton: ({ clipboard }: any) => createElement("button", { onClick: clipboard.copy }, "Copy output"),
}));
vi.mock("@/ui/use-clipboard-feedback", () => ({
  useClipboardFeedback: (payload: string) => ({ copy: () => { fixture.copied = payload; }, error: null }),
}));
vi.mock("./terminal-output-view", () => ({ TerminalOutputView: ({ output }: { output: string }) => createElement("pre", { "data-output-viewport": true }, output) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/screen-content-insets", () => ({ useScreenContentInsets: () => ({ left: 16, right: 16 }) }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {}, space: { screen: 16, sm: 6 } }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
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
  const Button = ({ label, disabled, busy, onPress, selected }: any) => {
    if (label === "Send command") fixture.submit = onPress;
    return createElement("button", { disabled: disabled || busy, onClick: onPress, "aria-pressed": selected }, label);
  };
  const Field = ({ label, value, editable, onChangeText }: any) => createElement("input", {
    "aria-label": label, value, disabled: !editable, onChange: (e: any) => onChangeText(e.target.value),
  });
  return { QueryState, Body: Group, Row: Group, StateView: ({ title }: any) => createElement("p", null, title), Disclosure: ({ children, label }: any) => createElement("details", null, createElement("summary", null, label), children), CodeText: ({ children }: any) => createElement("pre", null, children), Button, IconButton: Button, ChoiceChip: Button,
    Notice: ({ message, children }: any) => createElement("div", null, message, children),
    StatusLine: ({ label }: any) => createElement("p", null, label), StatusText: ({ label }: any) => createElement("span", null, label),
    MutationState: ({ mutation }: any) => mutation.error ? createElement("p", { role: "alert" }, String(mutation.error.message)) : null,
    Field, Input: Field, FieldError: ({ message }: any) => createElement("p", null, message), SearchField: Field,
    ActionMenu: ({ actions }: any) => createElement("div", null, actions.map((a: any) => createElement(Button, { key: a.key, ...a }))),
    FormActions: ({ submitLabel, disabled, busy, onSubmit, feedback, onCancel }: any) => createElement("div", null, feedback, createElement(Button, { label: submitLabel, disabled, busy, onPress: onSubmit }), onCancel ? createElement(Button, { label: "Cancel", onPress: onCancel }) : null),
    SelectField: ({ label, value, options, disabled, onChange }: any) => createElement("select", { "aria-label": label, value, disabled, onChange: (e: any) => onChange(e.target.value) }, createElement("option", { value: "" }, "Choose"), options.map((o: any) => createElement("option", { value: o.value, key: o.value }, o.label))),
    Sheet: ({ visible, title, children, dismissible, onClose }: any) => visible ? createElement("aside", { "data-title": title }, children, createElement(Button, { label: `Close ${title}`, disabled: dismissible === false, onPress: onClose })) : null,
    Screen: ({ children, actions, footer, refreshState, scroll }: any) => { fixture.refresh = refreshState; return createElement("main", { "data-page-scroll": scroll !== false }, createElement("section", null, actions, children), createElement("footer", null, footer)); },
  };
});
import { TerminalScreen } from "./terminal-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(async () => root.render(createElement(TerminalScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const button = (label: string) => [...node.querySelectorAll("button")].find(b => b.textContent === label)!;
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); };
const select = async (id: string) => {
  const tab = [...node.querySelectorAll("button[aria-pressed]")].find(item => item.textContent?.split(" · ")[0] === id) as HTMLButtonElement;
  expect(tab).toBeTruthy();
  await act(async () => tab.click());
};
const input = async (value: string) => { const field = node.querySelector('input[aria-label="Command"]')!; await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  disk.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); fixture.machineId = "computer"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "environment"; fixture.lanKey = "synthetic"; fixture.projectId = "project"; fixture.writable = true; fixture.paused = false;
  fixture.rows = ["one", "two"].map(id => ({ id, projectId: "project", name: id, cwd: "/project", state: "running" }));
  fixture.output = "Output\n".repeat(2000);
  fixture.request.mockReset().mockResolvedValue({ accepted: true }); fixture.client = { machine: { id: fixture.machineId, endpoint: fixture.endpoint, environmentId: fixture.environmentId, lanKey: fixture.lanKey }, request: fixture.request };
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
it("offers one create action in an empty writable project and opens a review without a Host write", async () => {
  fixture.rows = [];
  await render();
  expect(node.textContent).toContain("No terminals in this project.");
  expect([...node.querySelectorAll("button")].filter(item => item.textContent === "Create terminal")).toHaveLength(1);
  await click("Create terminal");
  expect(node.querySelector('aside[data-title="Create terminal"]')).not.toBeNull();
  expect(fixture.request).not.toHaveBeenCalled();
});
it("docks the command outside long output, preserves drafts across tabs, and sends only explicitly", async () => {
  await render(); expect(node.querySelector('button[aria-pressed="true"]')?.textContent).toBe("one");
  expect(node.querySelector("pre")!.textContent).toBe(fixture.output); expect(node.querySelector("footer button")!.textContent).toBe("Send command");
  expect(node.querySelector("main")!.getAttribute("data-page-scroll")).toBe("false");
  expect(node.querySelector("[data-output-viewport]")).not.toBeNull();
  await input("printf kept"); expect(fixture.blockedLeave).toBe(true);
  await select("two"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("");
  await select("one"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf kept"); expect(fixture.request).not.toHaveBeenCalled();
  await click("Send command"); expect(fixture.request).toHaveBeenCalledWith("terminals.write", { projectId: "project", id: "one", data: "printf kept\n" }, { retry: false });
  expect(node.querySelector("aside")).toBeNull(); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("");
});
it.each(["machine", "endpoint", "environment", "key", "project"])("rejects a stale command after a %s change and starts a separate target owner", async kind => {
  await render(); await select("one"); await input("printf previous");
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
  await render(); await select("one"); await input("printf retained"); fixture.client = { ...fixture.client }; await render();
  expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf retained"); expect(fixture.request).not.toHaveBeenCalled();
});
it("recovers a removed terminal's unsent draft as read-only without retargeting another terminal", async () => {
  await render(); await select("one"); await input("recover this draft"); fixture.rows = fixture.rows.filter(row => row.id !== "one"); await render();
  await select("two"); expect(node.querySelector("details pre")!.textContent).toBe("recover this draft"); expect(button("Send command").disabled).toBe(true); expect(fixture.request).not.toHaveBeenCalled();
});
it("does not submit a stop review when its terminal disappears", async () => {
  await render(); await select("one"); await click("Stop terminal"); fixture.rows = fixture.rows.filter(row => row.id !== "one"); await render();
  const confirmation = [...node.querySelectorAll<HTMLButtonElement>("aside button")].find(button => button.textContent === "Stop terminal")!;
  expect(confirmation.disabled).toBe(true); await act(() => confirmation.click()); expect(fixture.request).not.toHaveBeenCalled();
});
it("retains an uncertain command, owns its feedback once and never retries automatically", async () => {
  fixture.request.mockRejectedValueOnce(Object.assign(new Error("Synthetic uncertain write"), { uncertain: true }));
  await render(); await select("one"); await input("printf uncertain"); await click("Send command");
  expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1); expect(button("Send command").disabled).toBe(true);
  expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("printf uncertain");
  expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1); await click("Refresh"); await click("I checked the result"); expect(fixture.request).toHaveBeenCalledOnce();
});
it("refreshes from the action menu while distinguishing a paused list from an empty success", async () => {
  await render(); await click("Refresh"); expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.outputRead).toHaveBeenCalledOnce();
  fixture.paused = true; await render(); expect(node.textContent).not.toContain("No terminals in this project.");
});

it("copies the whole transcript as plain text while search is open", async () => {
  fixture.output = "Starting\n\u001b[31mFailed\u001b[0m";
  await render();
  await click("Search output");
  await click("Copy output");
  expect(fixture.copied).toBe("Starting\nFailed");
  expect(fixture.request).not.toHaveBeenCalled();
});

it("keeps inline input reachable and restores saved command after reopening without executing", async () => {
  await render(); await select("one");
  expect(node.querySelector('footer input[aria-label="Command"]')).toBeTruthy();
  await input("printf persisted");
  await act(async () => root.unmount()); root = createRoot(node);
  await render(); await select("one");
  expect((node.querySelector('footer input') as HTMLInputElement).value).toBe("printf persisted");
  expect(fixture.request).not.toHaveBeenCalled();
  await click("Send command");
  expect(node.querySelector('footer input')).toBeTruthy();
  expect((node.querySelector('footer input') as HTMLInputElement).value).toBe("");
  await input("printf next"); await click("Send command");
  expect(fixture.request).toHaveBeenCalledTimes(2);
});

it("restores uncertain delivery hold on reopen without replaying its retained command", async () => {
  fixture.request.mockRejectedValueOnce(Object.assign(new Error("Synthetic uncertain write"), { uncertain: true }));
  await render(); await select("one"); await input("printf uncertain"); await click("Send command");
  await act(async () => root.unmount()); root = createRoot(node);
  await render(); await select("one");
  expect(button("Send command").disabled).toBe(true);
  expect((node.querySelector('footer input') as HTMLInputElement).value).toBe("printf uncertain");
  expect(fixture.request).toHaveBeenCalledOnce();
});
it("recovers a retired terminal draft after reopening without copying it into another terminal", async () => {
  await render(); await select("one"); await input("retired command");
  await act(async () => root.unmount()); root = createRoot(node);
  fixture.rows = fixture.rows.filter(row => row.id !== "one");
  await render(); await select("two");
  expect((node.querySelector('footer input') as HTMLInputElement).value).toBe("");
  expect(node.querySelector("details pre")!.textContent).toBe("retired command");
  expect(button("Send command").disabled).toBe(true); expect(fixture.request).not.toHaveBeenCalled();
});
