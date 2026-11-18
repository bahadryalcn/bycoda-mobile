// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "./feedback";

vi.mock("react-native", () => ({
  StyleSheet: { flatten: (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style) },
  Text: ({ children }: PropsWithChildren) => createElement("span", null, children),
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
vi.mock("panelui-native/components/badge", () => ({
  Badge: ({ children, style }: PropsWithChildren<{ style: { flexDirection: string } }>) => createElement("div", { "data-direction": style.flexDirection }, children),
}));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: () => null }, useAnimatedStyle: () => ({}) }));
vi.mock("panelui-native/hooks/use-skeleton-handoff", () => ({ useSkeletonHandoff: () => ({}) }));
vi.mock("./motion", () => ({ reveal: {} }));
vi.mock("./typography", () => ({ Body: () => null }));
vi.mock("./buttons", () => ({ Button: () => null }));
vi.mock("./state-view", () => ({ StateView: () => null }));
vi.mock("./use-delayed-visible", () => ({ useDelayedVisible: () => false }));
vi.mock("./use-feedback-animation", () => ({ useFeedbackAnimation: () => ({}) }));
vi.mock("./copy", () => ({ useCopy: () => (a: string) => a }));
vi.mock("./error-message", () => ({ errorMessage: () => "" }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => null }));
vi.mock("./accessibility", () => ({ decorativeSvgProps: {} }));
vi.mock("./tokens", () => ({ lineHeight: { badge: 16 }, metrics: {}, radii: {}, space: { xs: 4, sm: 6, xxs: 2 } }));
vi.mock("panelui-native/components/alert", () => ({ Alert: () => null }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: () => null }));
vi.mock("./theme", () => ({
  useMobileTheme: () => ({
    colors: { fill: "#111", border: "#222", muted: "#999" },
    semanticColors: { success: { text: "#0f0", surface: "#010", border: "#020" } },
    uiStyles: { badge: { fontSize: 12 } },
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(element));
  return host;
}

it("draws a decorative leading icon in the tone ink and lays out as a row", () => {
  const Icon = (props: { size?: number; color?: string }) => createElement("i", { "data-size": props.size, "data-color": props.color });
  const host = render(createElement(Badge, { label: "Done", tone: "success", icon: Icon }));
  expect(host.querySelector("i")?.getAttribute("data-size")).toBe("12");
  expect(host.querySelector("i")?.getAttribute("data-color")).toBe("#0f0");
  expect(host.querySelector("[data-direction]")?.getAttribute("data-direction")).toBe("row");
});

it("renders no icon by default", () => {
  const host = render(createElement(Badge, { label: "Idle" }));
  expect(host.querySelector("i")).toBeNull();
  expect(host.textContent).toBe("Idle");
});
