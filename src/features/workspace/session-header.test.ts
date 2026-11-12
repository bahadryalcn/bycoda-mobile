// @vitest-environment happy-dom
import { act, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({ canGoBack: true, back: vi.fn(), replace: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/primitives", () => ({
  HeaderBackButton: ({ onPress }: { onPress: () => void }) => createElement("button", { onClick: onPress }, "Back"),
}));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
vi.mock("expo-router", () => ({ router: { canGoBack: () => nav.canGoBack, back: nav.back, replace: nav.replace } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
vi.mock("react-native", () => ({
  Text: ({ children }: PropsWithChildren) => createElement("span", null, children),
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
import { SessionHeader } from "./session-header";

it("keeps title, project and status in one header and the action state across status changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  let mounts = 0;
  function Action() {
    useEffect(() => {
      mounts++;
    }, []);
    return createElement("input", { defaultValue: "Action draft" });
  }
  const render = (status: string) =>
    root.render(createElement(SessionHeader, { title: "Fix login", context: "Project", status, tone: "live", actions: createElement(Action) }));
  try {
    await act(async () => render("Running"));
    const input = container.querySelector("input")!;
    input.value = "Preserved";
    await act(async () => render("Ready"));
    expect(container.textContent).toContain("Fix login");
    expect(container.textContent).toContain("Project");
    expect(container.textContent).toContain("Ready");
    expect(container.textContent).not.toContain("Running");
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Preserved");
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("goes back, or falls back to the session list when there is no history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SessionHeader, { title: "T", status: "Ready", tone: "muted" })));
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    expect(nav.back).toHaveBeenCalled();
    nav.canGoBack = false;
    await act(async () => button.click());
    expect(nav.replace).toHaveBeenCalledWith("/sessions");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
