// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { AutomationHistory } from "./automation-history";

const query = vi.hoisted(() => ({ data: [] as [] | undefined, error: undefined as Error | undefined }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name: "Computer" }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => true }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => query }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("../shared/format", () => ({ stamp: () => "" }));
vi.mock("../shared/status", () => ({ Status: () => null }));
vi.mock("@/ui/primitives", () => {
  const Button = ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, label);
  return {
    Button,
    Body: ({ children }: { children: ReactNode }) => children,
    ErrorText: ({ error }: { error?: string }) => error ?? null,
    QueryState: ({ query }: { query: { error?: Error } }) => query.error?.message ?? null,
    Row: () => null,
    Stack: () => null,
    StateView: () => null,
    ScreenList: ({ header }: { header: ReactNode }) => header,
    Sheet: ({ children, footer, onClose }: { children: ReactNode; footer?: ReactNode; onClose: () => void }) =>
      createElement("section", null, createElement(Button, { label: "Close", onPress: onClose }), children, footer),
  };
});

it.each(["auth", "identity"] as const)("conceals the last run summary after an %s error", async (kind) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const render = () => act(async () => root.render(createElement(AutomationHistory, {
    automationId: "automation",
    projectId: "project",
    automationName: "Release checks",
    summary: { id: "automation", lastRunError: "Earlier run failed" },
    onClose: vi.fn(),
  })));
  try {
    await render();
    expect(node.textContent).toContain("Release checks");
    expect(node.textContent).toContain("Earlier run failed");
    query.error = new RemoteHostError("machine", "network", "Computer offline");
    await render();
    expect(node.textContent).toContain("Earlier run failed");
    query.data = undefined;
    query.error = new RemoteHostError("machine", kind, "Reconnect this computer");
    await render();
    expect(node.textContent).toContain("Reconnect this computer");
    expect(node.textContent).not.toContain("Release checks");
    expect(node.textContent).not.toContain("Earlier run failed");
    query.data = [];
    query.error = undefined;
    await render();
    expect(node.textContent).toContain("Release checks");
    expect(node.textContent).toContain("Earlier run failed");
  } finally {
    query.data = [];
    query.error = undefined;
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("uses only the shared header close in the automation history sheet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const onClose = vi.fn();
  try {
    await act(async () => root.render(createElement(AutomationHistory, { automationId: "automation", projectId: "project", onClose })));
    const controls = [...node.querySelectorAll("button")].filter(button => button.textContent === "Close");
    expect(controls).toHaveLength(1);
    await act(async () => controls[0]!.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
