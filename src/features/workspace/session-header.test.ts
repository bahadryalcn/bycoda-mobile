// @vitest-environment happy-dom
import { act, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({ canGoBack: true, focused: true, unlocked: true, back: vi.fn(), replace: vi.fn(),
  handleBack: vi.fn(), keyboardVisible: false, dismissKeyboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/primitives", () => ({
  HeaderBackButton: ({ onPress }: { onPress: () => void }) => createElement("button", { onClick: onPress }, "Back"),
}));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
vi.mock("@/ui/chat-controls", () => ({
  ChatAction: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
}));
vi.mock("lucide-react-native/icons/list", () => ({ default: () => null }));
vi.mock("expo-router", () => ({
  router: { canGoBack: () => nav.canGoBack, back: nav.back, replace: nav.replace },
  useCanGoBack: () => nav.canGoBack,
  useIsFocused: () => nav.focused,
}));
vi.mock("@/state/security", () => ({ useSecurity: (select: (state: { status: string }) => unknown) =>
  select({ status: nav.unlocked ? "unlocked" : "locked" }) }));
vi.mock("panelui-native/hooks/use-back-handler", () => ({ useBackHandler: nav.handleBack }));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardController: {
  isVisible: () => nav.keyboardVisible, dismiss: nav.dismissKeyboard,
} }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
vi.mock("react-native", () => ({
  Text: ({ children }: PropsWithChildren) => createElement("span", null, children),
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
import { SessionHeader, useTabletSessionBackFallback } from "./session-header";

it("returns a root tablet conversation to the Sessions tab after the keyboard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  function Route({ tablet }: { tablet: boolean }) {
    useTabletSessionBackFallback(tablet);
    return null;
  }
  const render = (tablet = true) => act(() => root.render(createElement(Route, { tablet })));
  nav.replace.mockClear();
  nav.canGoBack = true;
  try {
    await render();
    expect(nav.handleBack).toHaveBeenLastCalledWith(false, expect.any(Function));
    nav.canGoBack = false;
    nav.focused = false;
    await render();
    expect(nav.handleBack).toHaveBeenLastCalledWith(false, expect.any(Function));
    nav.focused = true;
    nav.unlocked = false;
    await render();
    expect(nav.handleBack).toHaveBeenLastCalledWith(false, expect.any(Function));
    nav.unlocked = true;
    await render(false);
    expect(nav.handleBack).toHaveBeenLastCalledWith(false, expect.any(Function));
    await render();
    const [enabled, back] = nav.handleBack.mock.lastCall!;
    expect(enabled).toBe(true);
    nav.keyboardVisible = true;
    back();
    expect(nav.dismissKeyboard).toHaveBeenCalledOnce();
    expect(nav.replace).not.toHaveBeenCalled();
    nav.keyboardVisible = false;
    back();
    expect(nav.replace).toHaveBeenCalledExactlyOnceWith("/chats");
  } finally {
    await act(() => root.unmount());
    Object.assign(nav, { canGoBack: true, focused: true, unlocked: true, keyboardVisible: false });
    vi.unstubAllGlobals();
  }
});

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

it("drops the back button beside a split list and offers the session list on a tablet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  const showSessions = vi.fn();
  try {
    await act(async () => root.render(createElement(SessionHeader, { title: "Fix login", status: "Ready", tone: "muted", showBack: false })));
    expect(container.textContent).not.toContain("Back");
    expect(container.textContent).not.toContain("Sessions");
    await act(async () => root.render(createElement(SessionHeader, { title: "Fix login", status: "Ready", tone: "muted", onShowSessions: showSessions })));
    const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toEqual(["Back", "Sessions"]);
    await act(async () => container.querySelectorAll("button")[1]!.click());
    expect(showSessions).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
