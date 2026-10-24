// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HostToolScreen } from "./index";

const state = vi.hoisted(() => ({ capabilities: [] as string[], directory: {
  data: [{ id: "project", name: "Project", cwd: "/project" }] as { id: string; name: string; cwd: string }[] | undefined,
  directoryReady: true, privacyUnavailable: false, isPending: false, error: undefined as Error | undefined,
  isProjectVisible: () => state.directory.directoryReady,
} }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("@/ui/private-content", () => ({ PrivateContentBoundary: ({ visible, children }: { visible: boolean; children: ReactNode }) => createElement("div", { hidden: !visible }, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: state.capabilities }) }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => state.directory }));
vi.mock("@/ui/primitives", () => ({
  Screen: "section", QueryState: ({ query, loadingLabel }: { query: { isPending?: boolean; error?: Error }; loadingLabel?: string }) =>
    query.error ? createElement("p", null, query.error.message) : query.isPending ? createElement("p", null, loadingLabel) : null,
  Empty: ({ title }: { title: string }) => createElement("p", null, title),
  Notice: ({ message }: { message: string }) => createElement("p", null, message),
  Button: ({ label }: { label: string }) => createElement("button", null, label),
}));
vi.mock("./dev-servers-screen", () => ({ DevServersScreen: () => null }));
vi.mock("./runtime-logs-screen", () => ({ RuntimeLogsScreen: () => null }));
vi.mock("./devices-screen", () => ({ DevicesScreen: () => null }));
vi.mock("./browser-screen", () => ({ BrowserScreen: () => null }));
vi.mock("./terminal-screen", () => ({ TerminalScreen: () => null }));
vi.mock("./diagnostics-screen", () => ({ DiagnosticsScreen: () => createElement("div", null,
  createElement("p", null, "Host resources"), createElement("input", { "aria-label": "Tool draft", defaultValue: "" })) }));
vi.mock("./usage-screen", () => ({ UsageScreen: () => createElement("p", null, "Host session usage") }));
vi.mock("./provider-center", () => ({ ProviderCenter: () => createElement("p", null, "Global provider center") }));
vi.mock("./access-center", () => ({ AccessCenter: () => createElement("p", null, "Global host access center") }));

beforeEach(() => {
  state.capabilities = [];
  Object.assign(state.directory, { data: [{ id: "project", name: "Project", cwd: "/project" }], directoryReady: true, privacyUnavailable: false, isPending: false, error: undefined });
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([{ capabilities: [] }, { capabilities: ["runtime.logs"] }])("identifies unknown tools independently of advertised capabilities: %j", ({ capabilities }) => {
  state.capabilities = capabilities;
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "unknown", projectId: "project" }));
  expect(html).toContain("Tool not found");
  expect(html).not.toContain("Update bycoda");
  expect(html).toContain("Back to projects");
});
it("retains host-update guidance for a recognized unsupported tool", () => {
  state.capabilities = [];
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "logs", projectId: "project" }));
  expect(html).toContain("Update bycoda on your computer");
  expect(html).not.toContain("Tool not found");
});
it("opens diagnostics only when the host advertises resource diagnostics", () => {
  state.capabilities = ["resources.diagnostics"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }))).toContain("Host resources");
  state.capabilities = ["runtime.logs"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }))).toContain("Update bycoda on your computer");
});
it("opens usage only with its specific read capability", () => {
  state.capabilities = ["usage.sessions.read"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "usage", projectId: "project" }))).toContain("Host session usage");
  state.capabilities = ["resources.diagnostics"];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "usage", projectId: "project" }))).toContain("Update bycoda on your computer");
});
it("opens the global provider center without requiring a selected project", () => {
  state.capabilities = [];
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "providers" }))).toContain("Global provider center");
});
it("opens host access without requiring a selected project", () => {
  expect(renderToStaticMarkup(createElement(HostToolScreen, { tool: "access" }))).toContain("Global host access center");
});

it.each(["loading", "error", "sync-required"])("does not replace %s project verification with a project chooser or host upgrade", (readiness) => {
  Object.assign(state.directory, { data: undefined, directoryReady: false,
    isPending: readiness === "loading", privacyUnavailable: readiness === "sync-required",
    error: readiness === "error" ? new Error("Connection unavailable") : undefined });
  const html = renderToStaticMarkup(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }));
  expect(html).not.toContain("Choose a project");
  expect(html).not.toContain("Update bycoda");
  expect(html).toContain(readiness === "loading" ? "Verifying project…" : readiness === "error" ? "Connection unavailable" : "sync the project directory");
});

it("preserves the mounted tool draft while expired project proof is concealed and reverified", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.capabilities = ["resources.diagnostics"];
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => root.render(createElement(HostToolScreen, { tool: "diagnostics", projectId: "project" }));
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
