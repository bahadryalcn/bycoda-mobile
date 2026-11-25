// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
type Layout = { nativeEvent: { lines: unknown[] } };
const fixture = vi.hoisted(() => ({ layouts: [] as ((event: Layout) => void)[] }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  Text: ({ children }: PropsWithChildren) => h("span", null, children),
  Pressable: ({ children, onPress, accessibilityState }: PropsWithChildren<{ onPress: () => void; accessibilityState?: { expanded?: boolean } }>) =>
    h("button", { onClick: onPress, "aria-expanded": accessibilityState?.expanded }, children),
  StyleSheet: { flatten: (value: unknown) => value },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("./typography", () => ({
  Body: ({ children, numberOfLines, onTextLayout }: PropsWithChildren<{ numberOfLines?: number; onTextLayout?: (event: Layout) => void }>) => {
    if (onTextLayout) fixture.layouts.push(onTextLayout);
    return h("p", { "data-lines": numberOfLines ?? "all", "data-measure": onTextLayout ? "yes" : undefined }, children);
  },
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({
  colors: { muted: "muted", accent: "accent", border: "border" },
  semanticColors: { info: { text: "blue" }, danger: { text: "red" }, warning: { text: "amber" }, success: { text: "green" } },
  uiStyles: {},
}) }));
vi.mock("./use-feedback-animation", () => ({ useFeedbackAnimation: () => false }));
vi.mock("./use-delayed-visible", () => ({ useDelayedVisible: () => true }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./buttons", () => ({ Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label) }));
vi.mock("./state-view", () => ({ StateView: () => null }));
vi.mock("./error-message", () => ({ errorMessage: () => "" }));
vi.mock("panelui-native/components/badge", () => ({ Badge: () => null }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: () => h("i", null, "spinner") }));
vi.mock("panelui-native/components/alert", () => ({ Alert: ({ children }: PropsWithChildren) => h("section", null, children) }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => h("i", null, "icon") }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => h("i", null, "icon") }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => h("i", null, "icon") }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => h("i", null, "icon") }));
import { Notice, StatusLine } from "./feedback";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.layouts = [];
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("draws one line with an icon, the label and a text action", async () => {
  const onPress = vi.fn();
  await act(async () => root.render(h(StatusLine, { tone: "warning", label: "Showing the last loaded version", action: { label: "Refresh", onPress } })));
  expect(container.textContent).toBe("iconShowing the last loaded versionRefresh");
  await act(async () => container.querySelector("button")!.click());
  expect(onPress).toHaveBeenCalledOnce();
  await act(async () => root.render(h(StatusLine, { label: "Reconnecting…", busy: true })));
  expect(container.querySelector("button")).toBeNull();
  expect(container.textContent).not.toContain("icon");
});

it("clamps a long notice to two lines behind Details and expands it in place", async () => {
  const message = "The computer could not be reached.\n\nThe action may have been applied. Check the result before retrying.";
  await act(async () => root.render(h(Notice, { tone: "danger", message })));
  const visible = () => container.querySelector("p:not([data-measure])")!;
  expect(visible().getAttribute("data-lines")).toBe("2");
  expect(container.textContent).not.toContain("Details");
  await act(async () => fixture.layouts.at(-1)!({ nativeEvent: { lines: [1, 2, 3, 4] } }));
  const toggle = [...container.querySelectorAll("button")].find((button) => button.textContent === "Details")!;
  await act(async () => toggle.click());
  expect(visible().getAttribute("data-lines")).toBe("all");
  expect(container.textContent).toContain("Less");
});

it("shows no Details control for a message that fits", async () => {
  await act(async () => root.render(h(Notice, { message: "Saved" })));
  await act(async () => fixture.layouts.at(-1)!({ nativeEvent: { lines: [1] } }));
  expect(container.textContent).not.toContain("Details");
});
