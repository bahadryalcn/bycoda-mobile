// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserScreen } from "./browser-screen";
const state = vi.hoisted(() => {
  const draftCallbacks = new Map<string, (value: string) => void>();
  const value = { id: "machine", endpoint: "https://fixture.invalid", environmentId: "host", lanKey: "synthetic", available: true, installed: false, open: false, annotationId: undefined as string | undefined, selection: undefined as unknown, transfer: vi.fn(), openURL: vi.fn(async () => {}), phase: "connected", failure: undefined as Error | undefined, requests: [] as { method: string; params: unknown }[], client: {} as Record<string, unknown> };
  value.client = { machine: { id: "machine", endpoint: "https://fixture.invalid", environmentId: "host", lanKey: "synthetic" }, endpoint: "https://fixture.invalid", request: async (method: string, params: unknown) => {
    value.requests.push({ method, params });
    if (value.failure && method === "browser.open") throw value.failure;
    if (method === "browser.annotation.start") value.annotationId = "annotation";
    return { open: value.open, controlling: value.open, leaseId: value.open ? "lease" : undefined, leaseExpiresAt: Date.now() + 60_000, navigationId: "nav", annotationId: value.annotationId,
      ...(method === "browser.frame" ? { data: "YWJj", mimeType: "image/jpeg", width: 1280, height: 720 } : {}),
      ...(method === "browser.annotation.select" || method === "browser.annotation.read" ? { selection: value.selection } : {}), runtime: { installed: value.installed, installing: false, version: "1" } };
  } }; return Object.assign(value, { draftCallbacks, toast: vi.fn(), confirmations: [] as unknown[][] });
});
vi.mock("react-native", () => ({ View: ({ children }: { children?: unknown }) => children as never, Linking: { openURL: state.openURL } }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => createElement("div", {"data-native-route-title":true}) } }));
vi.mock("lucide-react-native/icons/arrow-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/rotate-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/external-link", () => ({ default: () => null }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: state.phase, status: "Disconnected", reason: "Computer offline" }) }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/remote-frame", () => ({ RemoteFrame: ({ onPress }: { onPress?: (point: { x: number; y: number }) => void }) => createElement("button", { onClick: () => onPress?.({ x: 10, y: 20 }) }, "Browser frame") }));
vi.mock("@/ui/action-field", () => ({ ActionField: ({ value, onChangeText, onAction, actionDisabled, error }: { value: string; onChangeText: (value: string) => void; onAction?: () => void; actionDisabled?: boolean; error?: string }) => {
  state.draftCallbacks.set("URL draft", onChangeText);
  return createElement("div", null, createElement("input", { "aria-label": "URL draft", value, onChange: (e: { target: { value: string } }) => onChangeText(e.target.value) }), createElement("button", { disabled: actionDisabled, onClick: onAction }, "Open"), error ? createElement("p", null, error) : null);
} }));
vi.mock("@/ui/overflow-menu", () => ({ ActionMenu: ({ actions }: { actions: { key: string; label: string; disabled?: boolean; onPress: () => void }[] }) => createElement("div", null,
  actions.map(action => createElement("button", { key: action.key, disabled: action.disabled, onClick: action.onPress }, action.label))) }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, name: "Computer", endpoint: state.endpoint, environmentId: state.environmentId, lanKey: state.lanKey, capabilities: ["browser.shared.setup", "browser.annotation", "attachments.ownership.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: state.id, machines: [machine()] }) } };
});
vi.mock("../workspace/composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => state.available ? state.client : null, useHostReadActive: () => true }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false, run: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }) }));
// The real store reaches netinfo, which Vitest cannot parse; frame quality is not under test here.
vi.mock("@/state/data-saver", () => ({ useDataSaverActive: () => false, DATA_SAVER_FRAME_QUALITY: 35 }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (...args: unknown[]) => state.confirmations.push(args) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: Wrapper, Screen: ({ children, actions, footer }: PropsWithChildren<{ actions?: import("react").ReactNode; footer?: import("react").ReactNode }>) => createElement("div", null, actions, children, createElement("footer", null, footer)), Row: Wrapper, Disclosure: Wrapper,
    Field: ({ label, value, onChangeText }: any) => createElement("input", { "aria-label": label, value, onChange: (e: any) => onChangeText(e.target.value) }), ErrorText: () => null, MutationState: () => null,
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) => createElement("div", null, createElement("p", null, title), description ? createElement("p", null, description) : null, action ? createElement(Button, { label: action.label, onPress: action.onPress }) : null),
    Loading: ({ label }: { label?: string }) => createElement("p", null, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button, IconButton: Button,
    Sheet: ({ visible, children }: PropsWithChildren<{ visible?: boolean }>) => visible ? createElement("section", null, children) : null,
    FormActions: ({ submitLabel, disabled, onSubmit }: { submitLabel: string; disabled?: boolean; onSubmit: () => void }) => createElement(Button, { label: submitLabel, disabled, onPress: onSubmit }),
    showToast: state.toast };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
const originalClient = state.client;
async function rerender(sessionId?: string, projectId = "project", initialUrl = "") { await act(async () => root!.render(createElement(BrowserScreen, { project: { id: projectId, name: "Project", cwd: "/fixture" }, sessionId, initialUrl }))); }
async function render(sessionId?: string) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(BrowserScreen, { project: { id: "project", name: "Project", cwd: "/fixture" }, sessionId }))); }
async function confirmSetup() {
  const setup = state.confirmations.find((row) => row[2] === "Set up browser tools") as [string, string, string, () => void, string, string] | undefined;
  await act(async () => setup![3]());
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.endpoint = "https://fixture.invalid"; state.environmentId = "host"; state.lanKey = "synthetic"; state.available = true; state.client = originalClient; state.requests = []; state.installed = false; state.open = false; state.annotationId = undefined; state.selection = undefined; state.transfer.mockClear(); state.phase = "connected"; state.failure = undefined; vi.unstubAllGlobals(); });
it("reads on open, and setup downloads require separate reviewed confirmation", async () => {
  await render(); expect(state.requests.map((row) => row.method)).toEqual(["browser.status"]);
  state.confirmations.length = 0; await click("Set up browser tools"); expect(state.requests).toHaveLength(1);
  const [title, detail, , , , intent] = state.confirmations[0] as [string, string, string, () => void, string, string];
  expect([title, intent]).toEqual(["Set up browser tools?", "default"]); expect(detail).toContain("downloads and installs"); await confirmSetup();
  expect(state.requests[1]).toEqual({ method: "browser.setup", params: { projectId: "project", leaseId: undefined } });
});
it("close preserves the reviewed lease and project and requires impact confirmation", async () => {
  state.open = true; state.installed = true; state.confirmations.length = 0; await render(); await click("Close browser"); expect(state.requests).toHaveLength(1);
  expect(state.confirmations).toHaveLength(1);
  const [title, detail, label, confirm] = state.confirmations[0] as [string, string, string, () => void];
  expect([title, label]).toEqual(["Close the browser?", "Close browser"]); expect(detail).toContain("affecting other viewers");
  expect(container.querySelector("footer")?.textContent).toContain("Scroll up");
  await act(async () => confirm()); expect(state.requests[1]).toEqual({ method: "browser.close", params: { projectId: "project", leaseId: "lease" } });
});
it("refuses a stale computer confirmation", async () => {
  state.confirmations.length = 0; await render(); await click("Set up browser tools"); state.id = "other"; await confirmSetup(); expect(state.requests.map((row) => row.method)).toEqual(["browser.status"]);
});
it("selects without clicking the page, verifies again, and transfers one canonical snapshot to the existing draft without sending", async () => {
  state.open = true; state.installed = true;
  state.selection = { id: "capture", projectId: "project", sessionId: "session", navigationId: "nav", capturedAt: "2026-10-22T00:00:00Z", pageUrl: "https://fixture.invalid", trust: "untrusted-page-data", limitations: [],
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 }, devicePixelRatio: 1,
    element: { tag: "button", text: "Page text", selector: "#fixture", path: "body > button", bounds: { x: 1, y: 2, width: 20, height: 30 }, center: { x: 11, y: 17 }, ancestry: [], computedStyle: {} }, screenshot: { mimeType: "image/jpeg", data: "YWJj", width: 1280, height: 720 } };
  await render("session"); await click("Refresh screen"); await click("Select element"); await click("Browser frame");
  expect(state.requests.at(-1)).toEqual({ method: "browser.annotation.select", params: { projectId: "project", sessionId: "session", leaseId: "lease", navigationId: "nav", annotationId: "annotation", x: 10, y: 20 } });
  await click("Add selection to draft"); await click("Add selection to draft");
  expect(state.requests.at(-1)?.method).toBe("browser.annotation.read"); expect(state.transfer).toHaveBeenCalledOnce();
  expect(state.transfer.mock.calls[0][0]).toMatchObject({ machineId: "machine", sessionId: "session", text: "", browserCapture: { capture: state.selection, comment: "" } });
  expect(state.requests.some((row) => row.method === "browser.input" || row.method === "commands.dispatch")).toBe(false);
});


it("keeps unavailable controls out of setup and restores the address draft after runtime recovery", async () => {
  await render();
  expect(container.querySelector('input[aria-label="URL draft"]')).toBeNull();
  expect(container.textContent).not.toContain("Take control");
  state.confirmations.length = 0; await click("Set up browser tools");
  expect(state.confirmations).toHaveLength(1);
  expect(state.requests.map(row => row.method)).toEqual(["browser.status"]);
  state.installed = true;
  await click("Refresh screen");
  const input = container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://draft.invalid/kept");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.value).toBe("https://draft.invalid/kept");
  state.installed = false;
  await click("Refresh screen");
  expect(container.querySelector('input[aria-label="URL draft"]')).toBeNull();
  state.installed = true;
  await click("Refresh screen");
  expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe("https://draft.invalid/kept");
  expect(state.requests.every(row => row.method === "browser.status")).toBe(true);
});

async function inputDraft(label: string, value: string) {
  const field = container.querySelector(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("ignores delayed input from a retired transport body while keeping current batched edits", async () => {
  state.open = true; state.installed = true; await render();
  const oldInput = state.draftCallbacks.get("URL draft")!;
  await inputDraft("URL draft", "https://retained.invalid");
  state.client = { ...state.client }; await rerender();
  const currentInput = state.draftCallbacks.get("URL draft")!;
  await act(async () => {
    currentInput("https://current.invalid/first");
    currentInput("https://current.invalid/final");
  });
  await act(async () => oldInput("https://retired.invalid/late"));
  expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe("https://current.invalid/final");
  expect(state.requests.every(row => ["browser.status", "browser.release"].includes(row.method))).toBe(true);
});
it("retains URL/text drafts through transport replacement and temporary client loss without replaying them", async () => {
  state.open = true; state.installed = true; await render();
  await inputDraft("URL draft", "https://unsent.invalid/keep"); await click("Type text"); await inputDraft("Text", "Unsent text");
  state.requests = []; state.client = { ...state.client }; await rerender();
  expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe("https://unsent.invalid/keep");
  await click("Type text");
  expect((container.querySelector('input[aria-label="Text"]') as HTMLInputElement).value).toBe("Unsent text");
  state.available = false; await rerender(); expect(container.querySelector('input[aria-label="URL draft"]')).toBeNull();
  state.available = true; await rerender();
  expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe("https://unsent.invalid/keep");
  await click("Type text");
  expect((container.querySelector('input[aria-label="Text"]') as HTMLInputElement).value).toBe("Unsent text");
  expect(state.requests.every(row => ["browser.status", "browser.release"].includes(row.method))).toBe(true);
});
it.each(["machine", "endpoint", "environment", "key", "project", "session", "initial-url"])("starts a new draft owner when the reviewed %s changes", async kind => {
  state.open = true; state.installed = true; await render(); await inputDraft("URL draft", "https://previous-target.invalid");
  if (kind === "machine") state.id = "other-machine";
  if (kind === "endpoint") state.endpoint = "https://repaired.invalid";
  if (kind === "environment") state.environmentId = "other-environment";
  if (kind === "key") state.lanKey = "other-synthetic";
  state.client = { ...state.client, machine: { id: state.id, endpoint: state.endpoint, environmentId: state.environmentId, lanKey: state.lanKey } };
  await rerender(kind === "session" ? "other-session" : undefined, kind === "project" ? "other-project" : "project", kind === "initial-url" ? "https://new-start.invalid" : "");
  expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe(kind === "initial-url" ? "https://new-start.invalid" : "");
  if (kind === "project") { await rerender(); expect((container.querySelector('input[aria-label="URL draft"]') as HTMLInputElement).value).toBe(""); }
});
it.each(["endpoint", "environment", "key"])("refuses a same-id %s replacement before a stale confirmation can dispatch", async kind => {
  state.confirmations.length = 0; await render(); await click("Set up browser tools");
  if (kind === "endpoint") state.endpoint = "https://repaired.invalid";
  if (kind === "environment") state.environmentId = "other-environment";
  if (kind === "key") state.lanKey = "other-synthetic";
  await confirmSetup(); expect(state.requests.map(row => row.method)).toEqual(["browser.status"]);
});
it("retains an unsent selection comment through a reconnect but requires a fresh selection read", async () => {
  state.open = true; state.installed = true;
  state.selection = { id: "capture", projectId: "project", sessionId: "session", navigationId: "nav", capturedAt: "2026-10-22T00:00:00Z", pageUrl: "https://fixture.invalid", trust: "untrusted-page-data", limitations: [],
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 }, devicePixelRatio: 1,
    element: { tag: "button", text: "Page text", selector: "#fixture", path: "body > button", bounds: { x: 1, y: 2, width: 20, height: 30 }, center: { x: 11, y: 17 }, ancestry: [], computedStyle: {} }, screenshot: { mimeType: "image/jpeg", data: "YWJj", width: 1280, height: 720 } };
  await render("session"); await click("Refresh screen"); await click("Select element"); await click("Browser frame"); await inputDraft("Comment", "Unsent comment");
  state.requests = []; state.client = { ...state.client }; await rerender("session");
  expect(container.querySelector('input[aria-label="Comment"]')).toBeNull(); expect(state.transfer).not.toHaveBeenCalled();
  expect(state.requests.every(row => ["browser.status", "browser.release"].includes(row.method))).toBe(true);
  await click("Refresh screen"); await click("Browser frame");
  expect((container.querySelector('input[aria-label="Comment"]') as HTMLInputElement).value).toBe("Unsent comment"); expect(state.transfer).not.toHaveBeenCalled();
});
it("waits for a replaced client's late claim to release before the new scope reads", async () => {
  state.installed = true; const machine = state.client.machine; const oldMethods: string[] = [], newMethods: string[] = [];
  let claim!: (value: unknown) => void;
  const response = { open: false, runtime: { installed: true, installing: false } };
  state.client = { machine, endpoint: state.endpoint, request: async (method: string) => {
    oldMethods.push(method); return method === "browser.claim" ? new Promise(resolve => { claim = resolve; }) : response;
  } };
  await render(); await inputDraft("URL draft", "https://late.invalid"); await click("Open");
  state.client = { machine, endpoint: state.endpoint, request: async (method: string) => { newMethods.push(method); return response; } };
  await rerender(); expect(newMethods).toEqual([]);
  await act(async () => claim({ ...response, open: true, controlling: true, leaseId: "late-lease", leaseExpiresAt: Date.now() + 60_000 }));
  expect(oldMethods).toEqual(["browser.status", "browser.claim", "browser.release"]); expect(newMethods).toEqual(["browser.status"]);
  expect(container.querySelector('input[aria-label="URL draft"]')).not.toBeNull();
});

it("leaves the parent navigator title alone when embedded in a session sheet",async()=>{await render();expect(container.querySelector("[data-native-route-title]")).not.toBeNull();await act(async()=>root!.render(createElement(BrowserScreen,{project:{id:"project",name:"Project",cwd:"/fixture"},embedded:true})));expect(container.querySelector("[data-native-route-title]")).toBeNull();});
it("claims the shared browser on the first action instead of asking the user to take control", async () => {
  state.installed = true; const machine = state.client.machine; const methods: string[] = [];
  state.client = { machine, endpoint: state.endpoint, request: async (method: string, params: unknown) => {
    methods.push(method); state.requests.push({ method, params });
    const claimed = method !== "browser.status";
    return { open: method === "browser.open", controlling: claimed, leaseId: claimed ? "lease" : undefined, leaseExpiresAt: Date.now() + 60_000, navigationId: "nav", runtime: { installed: true, installing: false } };
  } };
  await render();
  expect(container.textContent).toContain("No page open");
  expect(container.textContent).not.toContain("Take control");
  await inputDraft("URL draft", "https://example.invalid"); await click("Open");
  expect(methods.slice(0, 3)).toEqual(["browser.status", "browser.claim", "browser.open"]);
  expect(state.requests.find((row) => row.method === "browser.open")?.params).toMatchObject({ leaseId: "lease", url: "https://example.invalid" });
});

const installedClient = (extra: Record<string, unknown> = {}) => {
  const machine = state.client.machine;
  state.client = { machine, endpoint: state.endpoint, request: async (method: string, params: unknown) => {
    state.requests.push({ method, params });
    const claimed = method !== "browser.status";
    return { open: false, controlling: claimed, leaseId: claimed ? "lease" : undefined, leaseExpiresAt: Date.now() + 60_000, navigationId: "nav", runtime: { installed: true, installing: false }, ...(method === "browser.status" ? extra : {}) };
  } };
};
it("opens a browser-bar address without a scheme as https", async () => {
  installedClient(); await render();
  await inputDraft("URL draft", "www.google.com"); await click("Open");
  expect(state.requests.find((row) => row.method === "browser.open")?.params).toMatchObject({ url: "https://www.google.com" });
});
it("explains an address it cannot open before sending anything", async () => {
  installedClient(); await render();
  await inputDraft("URL draft", "not an address"); await click("Open");
  expect(container.textContent).toContain("Enter a web address such as example.com.");
  expect(state.requests.map((row) => row.method)).toEqual(["browser.status"]);
});
it("shows a lost connection up front and keeps Open disabled", async () => {
  installedClient(); state.phase = "disconnected"; await render();
  // The computer pill reports the link; the page keeps one state and disables Open.
  await inputDraft("URL draft", "example.com");
  const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Open")!;
  expect(open.disabled).toBe(true);
});
it("offers taking over a browser another device holds instead of failing after Open", async () => {
  installedClient({ heldBy: { kind: "controller" }, controlling: false }); await render();
  expect(container.textContent).toContain("Another device is using the shared browser");
  await inputDraft("URL draft", "example.com");
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Open")!.disabled).toBe(true);
  await click("Take control");
  expect(state.requests.at(-1)).toMatchObject({ method: "browser.claim", params: { takeover: true } });
});
