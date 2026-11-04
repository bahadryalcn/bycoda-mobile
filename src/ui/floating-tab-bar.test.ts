// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FloatingTabBar } from "./floating-tab-bar";
const state = vi.hoisted(() => ({
  keyboard: false,
  emit: vi.fn(() => ({ defaultPrevented: false })),
  navigate: vi.fn(),
  haptic: vi.fn(),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("./motion", () => ({ haptic: { select: state.haptic } }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-keyboard-controller", () => ({
  useKeyboardState: (select: (s: { isVisible: boolean }) => unknown) =>
    select({ isVisible: state.keyboard }),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 320, fontScale: 1 }),
  View: ({
    children,
    accessibilityRole,
  }: PropsWithChildren<{ accessibilityRole?: string }>) =>
    createElement("div", { role: accessibilityRole }, children),
  Text: ({ children }: PropsWithChildren) =>
    createElement("span", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    onLongPress,
    "aria-selected": selected,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityRole: string;
    onPress: () => void;
    onLongPress: () => void;
    "aria-selected": boolean;
  }>) =>
    createElement(
      "button",
      {
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "aria-selected": selected,
        onClick: onPress,
        onContextMenu: onLongPress,
      },
      children,
    ),
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const routes = ["projects", "sessions", "inbox", "tools", "settings"].map(
  (name) => ({ name, key: name, params: { retained: name } }),
);
const props = {
  state: { index: 0, routes },
  descriptors: Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        options: {
          title: route.name,
          ...(route.name === "sessions" ? { tabBarBadge: "99+" } : {}),
        },
      },
    ]),
  ),
  navigation: { emit: state.emit, navigate: state.navigate },
} as unknown as Parameters<typeof FloatingTabBar>[0];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.keyboard = false;
  state.emit.mockReturnValue({ defaultPrevented: false });
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(createElement(FloatingTabBar, props)));
}
it("starts concealed when mounted while the keyboard is already open", async () => {
  state.keyboard = true;
  await render();
  expect(container.querySelector("[role=tablist]")).toBeNull();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("retains selected state, count meaning, route params, reselection events and long press", async () => {
  await render();
  const tabs = container.querySelectorAll("[role=tab]");
  expect(tabs).toHaveLength(5);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(tabs[1].getAttribute("aria-label")).toBe("sessions, 99+");
  await act(async () => (tabs[0] as HTMLElement).click());
  expect(state.emit).toHaveBeenLastCalledWith({
    type: "tabPress",
    target: "projects",
    canPreventDefault: true,
  });
  expect(state.navigate).not.toHaveBeenCalled();
  await act(async () => (tabs[1] as HTMLElement).click());
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith("sessions", {
    retained: "sessions",
  });
  expect(state.haptic).toHaveBeenCalledOnce();
  await act(async () =>
    tabs[4].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
  );
  expect(state.emit).toHaveBeenLastCalledWith({
    type: "tabLongPress",
    target: "settings",
  });
});
it("honors prevented navigation and follows an already-open keyboard without changing the selected route", async () => {
  state.emit.mockReturnValue({ defaultPrevented: true });
  await render();
  await act(async () =>
    (container.querySelectorAll("[role=tab]")[2] as HTMLElement).click(),
  );
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.haptic).not.toHaveBeenCalled();
  state.keyboard = true;
  await render();
  expect(container.querySelector("[role=tablist]")).toBeNull();
  state.keyboard = false;
  await render();
  expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe(
    "projects",
  );
  expect(state.navigate).not.toHaveBeenCalled();
});
