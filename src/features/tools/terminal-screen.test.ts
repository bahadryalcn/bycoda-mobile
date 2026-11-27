// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), ScrollView: ({ children }: PropsWithChildren) => createElement("div", null, children), Keyboard: { dismiss: vi.fn() } }));
const fixture = vi.hoisted(() => ({
  machineId: "computer", endpoint: "https://synthetic.invalid", environmentId: "environment", lanKey: "synthetic", projectId: "project", rows: [] as any[],
  writable: true, paused: false, output: "Output\n".repeat(2000), client: {} as any, request: vi.fn(), listRead: vi.fn(), outputRead: vi.fn(), poke: vi.fn(),
  refresh: undefined as any, blockedLeave: false, copied: "", stage: undefined as any,
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock("expo-router/react-navigation", () => ({ useNavigation: () => ({ dispatch: vi.fn(), setOptions: vi.fn() }), usePreventRemove: (blocked: boolean) => { fixture.blockedLeave = blocked; } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "synthetic-request-id" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square-terminal", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/text-select", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("./terminal-header-controls", () => ({
  TerminalPill: () => null,
  // The picker's rows stay rendered so tests choose a terminal the way the sheet does.
  TerminalPickerSheet: ({ terminals, selectedId, disabled, onSelect }: any) => createElement("nav", null, terminals.map((entry: any) =>
    createElement("button", { key: entry.id, "aria-pressed": entry.id === selectedId, disabled, onClick: () => onSelect(entry.id) }, entry.name))),
}));
// The terminal view is a WebView; this stand-in exposes its props so tests type and resize the way it does.
vi.mock("./terminal-console", () => ({
  TerminalConsoleStage: (props: any) => {
    fixture.stage = props;
    return createElement("div", null, props.notices,
      props.overlay ? createElement("section", { "data-reader": true }, props.overlay) : createElement("pre", { "data-terminal": true }, props.output?.output));
  },
}));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children, composer }: any) =>
  createElement("div", { "data-keyboard-frame": true }, children, createElement("footer", null, composer)) }));
vi.mock("@/ui/use-clipboard-feedback", () => ({
  useClipboardFeedback: (payload: string, _enabled?: boolean, _flight?: unknown, prepare?: () => Promise<string>) => ({
    copy: () => { if (prepare) void prepare().then((text) => { fixture.copied = text; }); else fixture.copied = payload; }, error: null,
  }),
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
  refetch: fixture.outputRead, poke: fixture.poke,
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
  ErrorNotice: ({ error }: any) => error ? createElement("p", { role: "alert" }, String(error.message)) : null, Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, busy, onPress, selected }: any) =>
    createElement("button", { disabled: disabled || busy, onClick: onPress, "aria-pressed": selected }, label);
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
    Sheet: ({ visible, title, children, dismissible, onClose }: any) => visible ? createElement("aside", { "data-title": title }, children, createElement(Button, { label: `Dismiss ${title}`, disabled: dismissible === false, onPress: onClose })) : null,
    Screen: ({ children, actions, footer, refreshState, scroll }: any) => { fixture.refresh = refreshState; return createElement("main", { "data-page-scroll": scroll !== false }, createElement("section", null, actions, children), createElement("footer", null, footer)); },
  };
});
import { TerminalScreen } from "./terminal-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(async () => root.render(createElement(TerminalScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const button = (label: string) => [...node.querySelectorAll("button")].find(b => b.textContent === label)!;
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); };
const sheetButton = (label: string) => [...node.querySelectorAll<HTMLButtonElement>("aside button")].find(b => b.textContent === label)!;
const select = async (id: string) => {
  const tab = [...node.querySelectorAll("button[aria-pressed]")].find(item => item.textContent === id) as HTMLButtonElement;
  expect(tab).toBeTruthy();
  await act(async () => tab.click());
};
const type = (data: string) => act(async () => fixture.stage.onInput(data));
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); fixture.machineId = "computer"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "environment"; fixture.lanKey = "synthetic"; fixture.projectId = "project"; fixture.writable = true; fixture.paused = false;
  fixture.rows = ["one", "two"].map(id => ({ id, projectId: "project", name: id, cwd: "/project", state: "running", transport: "pty" }));
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
it("shows the PTY full height and sends raw keystrokes in typing order, one write at a time", async () => {
  let release!: () => void;
  fixture.request.mockImplementationOnce(() => new Promise((done) => { release = () => done({ accepted: true }); }));
  await render(); expect(node.querySelector('button[aria-pressed="true"]')?.textContent).toBe("one");
  expect(node.querySelector("[data-terminal]")!.textContent).toBe(fixture.output);
  expect(node.querySelector("main")!.getAttribute("data-page-scroll")).toBe("false");
  expect(fixture.stage).toMatchObject({ enabled: true });
  await type("l");
  await type("s");
  await type("\t");
  await type("\r");
  // Keys typed while the first write is in flight wait and then go out together, in order.
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith("terminals.write", { projectId: "project", id: "one", data: "l" }, { retry: false });
  await act(async () => release()); await settle();
  expect(fixture.request).toHaveBeenLastCalledWith("terminals.write", { projectId: "project", id: "one", data: "s\t\r" }, { retry: false });
  expect(fixture.request).toHaveBeenCalledTimes(2);
  // The shell echoes: its output is read again right after each delivered write.
  expect(fixture.poke).toHaveBeenCalled();
  expect(fixture.blockedLeave).toBe(false);
});
it("splits a large paste into writes within the Host byte limit", async () => {
  await render();
  await type("ş".repeat(9000)); await settle(); await settle();
  const writes = fixture.request.mock.calls.map((call) => call[1].data as string);
  expect(writes.join("")).toBe("ş".repeat(9000));
  for (const data of writes) expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(16_384);
});
it.each(["machine", "endpoint", "environment", "key", "project"])("drops keys after a %s change and starts a separate target owner", async kind => {
  await render(); await select("one");
  const staleInput = fixture.stage.onInput;
  if (kind === "machine") fixture.machineId = "other";
  if (kind === "endpoint") fixture.endpoint = "https://repaired.invalid";
  if (kind === "environment") fixture.environmentId = "other";
  if (kind === "key") fixture.lanKey = "other-synthetic";
  if (kind === "project") fixture.projectId = "other-project";
  if (kind === "project") await render();
  await act(async () => staleInput("printf previous\r")); expect(fixture.request).not.toHaveBeenCalled();
  await render(); expect(node.querySelector("aside")).toBeNull(); expect(fixture.blockedLeave).toBe(false);
});
it("sends Ctrl+C to the foreground program from the menu without ending the shell", async () => {
  await render(); await select("one");
  await click("Send Ctrl+C");
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith("terminals.interrupt", { projectId: "project", id: "one" }, { retry: false });
  expect(node.querySelector("aside")).toBeNull();
});
it("reviews closing and does not submit when its terminal disappears", async () => {
  await render(); await select("one"); await click("Close terminal");
  expect(node.querySelector('aside[data-title="Close terminal"]')).not.toBeNull();
  fixture.rows = fixture.rows.filter(row => row.id !== "one"); await render();
  const confirmation = sheetButton("Close terminal");
  expect(confirmation.disabled).toBe(true); await act(() => confirmation.click()); expect(fixture.request).not.toHaveBeenCalled();
});
it("closes a reviewed terminal", async () => {
  await render(); await select("two"); await click("Close terminal");
  await act(async () => sheetButton("Close terminal").click());
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith("terminals.close", { projectId: "project", id: "two" }, { retry: false });
});
it("holds typing after an uncertain write, drops the undelivered keys and never retries", async () => {
  fixture.request.mockRejectedValueOnce(Object.assign(new Error("Synthetic uncertain write"), { uncertain: true }));
  await render(); await select("one"); await type("rm -rf build\r"); await settle();
  expect(fixture.stage.enabled).toBe(false);
  expect(node.textContent).toContain("The result is uncertain.");
  // Leaving asks once but is never trapped.
  expect(fixture.blockedLeave).toBe(true);
  await type("more"); expect(fixture.request).toHaveBeenCalledOnce();
  await click("I checked the result");
  expect(fixture.stage.enabled).toBe(true); expect(fixture.blockedLeave).toBe(false);
  await type("x"); await settle();
  expect(fixture.request).toHaveBeenCalledTimes(2);
  expect(fixture.request).toHaveBeenLastCalledWith("terminals.write", { projectId: "project", id: "one", data: "x" }, { retry: false });
});
it("shows a failed write and keeps typing available", async () => {
  fixture.request.mockRejectedValueOnce(new Error("Terminal has exited"));
  await render(); await type("ls\r"); await settle();
  expect(node.querySelector('[role="alert"]')?.textContent).toBe("Terminal has exited");
  expect(fixture.stage.enabled).toBe(true);
});
it("resizes the PTY once the fitted size settles and starts new terminals at that size", async () => {
  vi.useFakeTimers();
  try {
    await render(); await select("one");
    await act(async () => { fixture.stage.onResize(40, 10); fixture.stage.onResize(52, 18); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(fixture.request).toHaveBeenCalledExactlyOnceWith("terminals.resize", { projectId: "project", id: "one", cols: 52, rows: 18 }, { retry: false });
    await act(async () => { fixture.stage.onResize(52, 18); vi.advanceTimersByTime(200); });
    expect(fixture.request).toHaveBeenCalledOnce();
    await click("Create terminal");
    await act(async () => sheetButton("Create terminal").click());
    expect(fixture.request).toHaveBeenLastCalledWith("terminals.create", expect.objectContaining({ projectId: "project", cols: 52, rows: 18 }), { retry: false });
  } finally { vi.useRealTimers(); }
});
it("refreshes from the action menu while distinguishing a paused list from an empty success", async () => {
  await render(); await click("Refresh"); expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.outputRead).toHaveBeenCalledOnce();
  fixture.paused = true; await render(); expect(node.textContent).not.toContain("No terminals in this project.");
});

it("copies the whole output as plain text while search shows the raw output", async () => {
  fixture.output = "Starting\n\u001b[31mFailed\u001b[0m";
  await render();
  await click("Search output");
  expect(node.querySelector("[data-reader] [data-output-viewport]")).not.toBeNull();
  await click("Copy all output");
  expect(fixture.copied).toBe("Starting\nFailed");
  expect(fixture.request).not.toHaveBeenCalled();
});

it("opens selectable text over the terminal and returns to it", async () => {
  await render();
  await click("Select text");
  expect(node.querySelector("[data-reader] [data-output-viewport]")!.textContent).toBe(fixture.output);
  expect(node.querySelector('input[aria-label="Search output"]')).toBeNull();
  await click("Back to terminal");
  expect(node.querySelector("[data-reader]")).toBeNull();
  expect(node.querySelector("[data-terminal]")).not.toBeNull();
});
