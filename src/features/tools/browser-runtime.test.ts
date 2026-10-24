// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserScreen } from "./browser-screen";
const state = vi.hoisted(() => {
  const value = { id: "machine", installed: false, open: false, annotationId: undefined as string | undefined, selection: undefined as unknown, transfer: vi.fn(), requests: [] as { method: string; params: unknown }[], client: {} as Record<string, unknown> };
  value.client = { machine: { id: "machine", environmentId: "host" }, endpoint: "fixture.invalid", request: async (method: string, params: unknown) => {
    value.requests.push({ method, params });
    if (method === "browser.annotation.start") value.annotationId = "annotation";
    return { open: value.open, controlling: value.open, leaseId: value.open ? "lease" : undefined, leaseExpiresAt: Date.now() + 60_000, navigationId: "nav", annotationId: value.annotationId,
      ...(method === "browser.frame" ? { data: "YWJj", mimeType: "image/jpeg", width: 1280, height: 720 } : {}),
      ...(method === "browser.annotation.select" || method === "browser.annotation.read" ? { selection: value.selection } : {}), runtime: { installed: value.installed, installing: false, version: "1" } };
  } }; return value;
});
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/arrow-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => {} }));
vi.mock("@/ui/remote-frame", () => ({ RemoteFrame: ({ onPress }: { onPress?: (point: { x: number; y: number }) => void }) => createElement("button", { onClick: () => onPress?.({ x: 10, y: 20 }) }, "Browser frame") }));
vi.mock("@/ui/action-field", () => ({ ActionField: () => null }));
vi.mock("@/ui/overflow-menu", () => ({ ActionMenu: () => null }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, capabilities: ["browser.shared.setup", "browser.annotation", "attachments.ownership.v1"] }), useMachines: { getState: () => ({ activeId: state.id }) } }));
vi.mock("../workspace/composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => state.client, useHostReadActive: () => true }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false, run: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch { return undefined; } } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: Wrapper, Screen: ({ children, actions }: PropsWithChildren<{ actions?: import("react").ReactNode }>) => createElement("div", null, actions, children), Row: Wrapper, Disclosure: Wrapper, Field: () => null, ErrorText: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button, IconButton: Button,
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm", disabled, onPress: onConfirm }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(sessionId?: string) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(BrowserScreen, { project: { id: "project", name: "Project", cwd: "/fixture" }, sessionId }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.requests = []; state.installed = false; state.open = false; state.annotationId = undefined; state.selection = undefined; state.transfer.mockClear(); vi.unstubAllGlobals(); });
it("reads on open, and setup downloads require separate reviewed confirmation", async () => {
  await render(); expect(state.requests.map((row) => row.method)).toEqual(["browser.status"]);
  await click("Set up browser tools"); expect(state.requests).toHaveLength(1); expect(container.textContent).toContain("downloads and installs"); await click("Confirm");
  expect(state.requests[1]).toEqual({ method: "browser.setup", params: { projectId: "project", leaseId: undefined } });
});
it("close preserves the reviewed lease and project and requires impact confirmation", async () => {
  state.open = true; state.installed = true; await render(); await click("Close browser"); expect(state.requests).toHaveLength(1); expect(container.textContent).toContain("affecting other viewers");
  await click("Confirm"); expect(state.requests[1]).toEqual({ method: "browser.close", params: { projectId: "project", leaseId: "lease" } });
});
it("refuses a stale computer confirmation", async () => {
  await render(); await click("Set up browser tools"); state.id = "other"; await click("Confirm"); expect(state.requests.map((row) => row.method)).toEqual(["browser.status"]);
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
