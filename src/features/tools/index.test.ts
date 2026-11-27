// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "expo-router";
import { HostToolScreen } from "./index";

const state = vi.hoisted(() => ({ capabilities: [] as string[] | undefined,
  connectionPhase: "disconnected",
  directory: {
  data: [{ id: "project", name: "Project", cwd: "/project" }] as { id: string; name: string; cwd: string }[] | undefined,
  directoryReady: true, privacyUnavailable: false, isPending: false, error: undefined as Error | undefined,
  isProjectVisible: () => state.directory.directoryReady,
} }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), setParams: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: state.connectionPhase, health: {} }) }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("@/ui/private-content", () => ({ PrivateContentBoundary: ({ visible, children }: { visible: boolean; children: ReactNode }) => createElement("div", { hidden: !visible }, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: state.capabilities }) }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => state.directory }));
vi.mock("../workspace/project-picker", () => ({
  ProjectPicker: ({ onSelect }: { onSelect(project: { id: string; cwd: string }): void }) =>
    createElement("button", { onClick: () => onSelect({ id: "project", cwd: "/project" }) }, "Project"),
}));
vi.mock("@/ui/primitives", () => ({
  Screen: "section",
  QueryState: ({ query, loadingLabel }: { query: { isPending?: boolean; error?: Error; fetchStatus?: string }; loadingLabel?: string }) => {
    const message = query.error?.message ?? (query.fetchStatus === "paused" ? "Waiting for a connection" : query.isPending ? loadingLabel : undefined);
    return message ? createElement("p", null, message) : null;
  },
  Empty: ({ title, detail, action }: { title: string; detail?: string; action?: { label: string; onPress(): void } }) =>
    createElement("div", null, title, detail, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  StateView: ({ title, description }: any) => createElement("p", null, title, description), Notice: ({ message }: { message: string }) => createElement("p", null, message),
  Button: ({ label }: { label: string }) => createElement("button", null, label),
}));
vi.mock("./dev-servers-screen", () => ({ DevServersScreen: () => createElement("div", null,
  createElement("p", null, "Project servers"), createElement("input", { "aria-label": "Tool draft", defaultValue: "" })) }));
vi.mock("./devices-screen", () => ({ DevicesScreen: () => null }));
vi.mock("./browser-screen", () => ({ BrowserScreen: () => null }));
vi.mock("./terminal-screen", () => ({ TerminalScreen: () => null }));
vi.mock("./diagnostics-screen", () => ({ DiagnosticsScreen: () => createElement("div", null,
  createElement("p", null, "Host resources"), createElement("input", { "aria-label": "Tool draft", defaultValue: "" })) }));
vi.mock("./usage-screen", () => ({ UsageScreen: () => createElement("p", null, "Host session usage") }));
vi.mock("./provider-center", () => ({ ProviderCenter: () => createElement("p", null, "Global provider center") }));
vi.mock("./access-center", () => ({ AccessCenter: () => createElement("p", null, "Global host access center") }));
vi.mock("@/ui/no-computer", () => ({ NoComputerGate: () => createElement("p", null, "Connect a computer first"), NoComputerState: () => createElement("p", null, "Connect a computer first") }));

beforeEach(() => {
  state.capabilities = [];
  state.connectionPhase = "disconnected";
  Object.assign(state.directory, { data: [{ id: "project", name: "Project", cwd: "/project" }], directoryReady: true, privacyUnavailable: false, isPending: false, error: undefined });
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([{ capabilities: [] }, { capabilities: ["dev.servers"] }])("identifies unknown tools independently of advertised capabilities: %j", ({ capabilities }) => {
  state.capabilities = capabilities;
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "unknown", projectId: "project" }));
  expect(html).toContain("Tool not found");
  expect(html).not.toContain("bycoda may be outdated");
  expect(html).toContain("Back to projects");
});
it("no longer offers runtime logs on mobile, even when the host advertises them", () => {
  state.capabilities = ["runtime.logs"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "logs", projectId: "project" }))).toContain("Tool not found");
});
it("retains host-update guidance for a recognized unsupported tool", () => {
  state.capabilities = [];
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "servers", projectId: "project" }));
  expect(html).toContain("bycoda may be outdated");
  expect(html).not.toContain("Tool not found");
});
it.each([
  ["checking", "Checking connection…"],
  ["connected", "Checking connection…"],
  ["disconnected", "Waiting for a connection"],
])("shows %s feedback while a restored computer's tool capabilities are unknown", (phase, message) => {
  state.capabilities = undefined;
  state.connectionPhase = phase;
  const tool = createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" });
  const html = renderToStaticMarkup(tool);
  expect(html).toContain(message);
  expect(html).not.toContain("bycoda may be outdated");
  expect(html).not.toContain("Host resources");
  state.capabilities = ["resources.diagnostics"];
  expect(renderToStaticMarkup(tool)).toContain("Host resources");
});
it("opens diagnostics only when the host advertises resource diagnostics", () => {
  state.capabilities = ["resources.diagnostics"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }))).toContain("Host resources");
  state.capabilities = ["runtime.logs"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }))).toContain("bycoda may be outdated");
});
it("opens usage only with its specific read capability", () => {
  state.capabilities = ["usage.sessions.read"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "usage", projectId: "project" }))).toContain("Host session usage");
  state.capabilities = ["resources.diagnostics"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "usage", projectId: "project" }))).toContain("bycoda may be outdated");
});
it("opens the global provider center without requiring a selected project", () => {
  state.capabilities = [];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "providers" }))).toContain("Global provider center");
});
it("opens host access without requiring a selected project", () => {
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "access" }))).toContain("Global host access center");
});

it("opens resources at computer level even when a project is in the route", () => {
  state.capabilities = ["resources.diagnostics"];
  Object.assign(state.directory, { data: undefined, directoryReady: false, isPending: true });
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }))).toContain("Host resources");
});

it("opens computer usage and resources without a project", () => {
  state.capabilities = ["usage.limits.read", "resources.diagnostics"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "usage" }))).toContain("Host session usage");
  state.capabilities = ["usage.cost.read"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics" }))).toContain("Not on this computer");
});

it("sets the shared project chosen from a tool's empty state", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.capabilities = ["dev.servers"];
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    const onSelectProject = vi.fn();
    await act(async () => root.render(createElement(HostToolScreen, { tool: "servers", onSelectProject })));
    expect(container.textContent).not.toContain("Back to projects");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelectorAll("button")[1]?.textContent).toBe("Project");
    await act(async () => container.querySelectorAll("button")[1]!.click());
    // The choice sets the shared selection, never a route-private project.
    expect(onSelectProject).toHaveBeenCalledWith("project");
    expect(router.setParams).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(["loading", "error", "sync-required"])("does not replace %s project verification with a project chooser or host upgrade", (readiness) => {
  Object.assign(state.directory, { data: undefined, directoryReady: false,
    isPending: readiness === "loading", privacyUnavailable: readiness === "sync-required",
    error: readiness === "error" ? new Error("Connection unavailable") : undefined });
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "servers", projectId: "project" }));
  expect(html).not.toContain("Choose a project");
  expect(html).not.toContain("bycoda may be outdated");
  expect(html).toContain(readiness === "loading" ? "Verifying project…" : readiness === "error" ? "Connection unavailable" : "sync the project directory");
});

it("preserves the mounted tool draft while expired project proof is concealed and reverified", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.capabilities = ["dev.servers"];
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => root.render(createElement(HostToolScreen, { tool: "servers", projectId: "project" }));
  try {
    await act(async () => { render(); });
    const input = container.querySelector("input")!;
    input.value = "Retained diagnostic draft";
    Object.assign(state.directory, { data: undefined, directoryReady: false, isPending: true });
    await act(async () => { render(); });
    expect(container.querySelector("input")).toBe(input);
    expect(input.closest("[hidden]")).not.toBeNull();
    expect(container.textContent).toContain("Verifying project…");
    Object.assign(state.directory, { data: [{ id: "project", name: "Project", cwd: "/project" }], directoryReady: true, isPending: false });
    await act(async () => { render(); });
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Retained diagnostic draft");
    expect(input.closest("[hidden]")).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
