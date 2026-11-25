import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("panelui-native/components/empty-state", () => ({
  EmptyState: Object.assign(function EmptyState() { return null; }, { Header: "EmptyStateHeader", Content: "EmptyStateContent" }),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: { info: {}, success: {}, warning: {}, danger: {} }, uiStyles: { title: {}, grow: {}, stateColumn: { maxWidth: 320 } } }) }));
vi.mock("./typography", () => ({ Body: "Body", Heading: "Heading" }));
vi.mock("./buttons", () => ({ Button: "Button" }));
vi.mock("./illustrations", () => ({ Illustration: "Illustration" }));
vi.mock("./status-line", () => ({ StatusLine: "StatusLine" }));
vi.mock("./duotone-icon", () => ({ Inbox: "DuotoneIcon", Info: "DuotoneIcon", CircleCheck: "DuotoneIcon", TriangleAlert: "DuotoneIcon", CircleAlert: "DuotoneIcon" }));
vi.mock("./styles", () => ({ uiStyles: { title: {}, grow: {}, stateColumn: { maxWidth: 320 } } }));
vi.mock("./tokens", () => ({ colors: {}, semanticColors: {}, iconSize: { status: 16 } }));
vi.mock("lucide-react-native/icons/inbox", () => ({ default: "Icon" }));
vi.mock("lucide-react-native/icons/info", () => ({ default: "Icon" }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: "Icon" }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: "Icon" }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: "Icon" }));
import { StateView } from "./state-view";

function find(node: ReactNode, type: string, found: Array<{ props: Record<string, unknown> }> = []) {
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === type || (typeof node.type === "function" && node.type.name === type)) found.push(node as never);
    Children.forEach(node.props.children, (child) => find(child, type, found));
  }
  return found;
}

it("centers a full-area first-run state with art, header title and a primary action", () => {
  const onPress = vi.fn();
  const tree = StateView({ illustration: "connect-computer", title: "Connect", description: "Pair first", action: { label: "Pair", onPress } });
  expect(find(tree, "Illustration")[0].props).toMatchObject({ name: "connect-computer", size: 168 });
  expect(find(tree, "Heading")).toHaveLength(1);
  expect(find(tree, "ActionButton")[0].props).toMatchObject({ action: { label: "Pair" }, tone: "primary" });
});
it("never illustrates an error: error art becomes the small tone icon and the message is clamped", () => {
  for (const illustration of ["error", "unreachable", "offline", "locked"] as const) {
    const tree = StateView({ illustration, title: "Can't reach", description: "Long reason", tone: "danger", action: { label: "Retry", onPress: vi.fn() } });
    expect(find(tree, "Illustration")).toHaveLength(0);
    expect(find(tree, "DuotoneIcon")[0].props.size).toBe(22);
    expect(find(tree, "Body")[0].props.numberOfLines).toBe(3);
  }
});
it("renders one status line for the line size", () => {
  const action = { label: "Retry", onPress: vi.fn() };
  const tree = StateView({ title: "This section couldn't load.", size: "line", tone: "danger", action });
  expect(find(tree, "StatusLine")[0].props).toMatchObject({ tone: "danger", label: "This section couldn't load.", action });
  expect(find(tree, "Heading")).toHaveLength(0);
});
it("keeps a compact section state to two description lines and a compact action", () => {
  const tree = StateView({ title: "x", description: "y", size: "compact", action: { label: "A", onPress: vi.fn() } });
  expect(find(tree, "Body")[0].props.numberOfLines).toBe(2);
  expect(find(tree, "ActionButton")[0].props.inline).toBe(true);
  // An explicit size wins over the legacy flag.
  expect(find(StateView({ title: "x", compact: true, size: "region" }), "EmptyStateHeader")).toHaveLength(1);
});
it("uses the same compact icon row even when the caller supplies full-page art", () => {
  const inline = StateView({ illustration: "error", title: "x", compact: true, tone: "danger" });
  expect(find(inline, "Illustration")).toHaveLength(0);
  expect(find(inline, "Icon")).toHaveLength(1);
});
it("keeps a neutral section state to quiet text without art or glyph", () => {
  const inline = StateView({ illustration: "inbox-empty", title: "Nothing here yet.", size: "compact" });
  expect(find(inline, "Illustration")).toHaveLength(0);
  expect(find(inline, "Icon")).toHaveLength(0);
});
it("shows a quiet secondary action below the primary one", () => {
  const tree = StateView({ title: "x", action: { label: "A", onPress: vi.fn() }, secondaryAction: { label: "B", onPress: vi.fn() } });
  expect(find(tree, "ActionButton").map((b) => b.props.tone)).toEqual(["primary", "quiet"]);
});
it("uses duotone only for full-region state glyphs", () => {
  for (const tone of ["neutral", "info", "success", "warning", "danger"] as const) {
    expect(find(StateView({ title: "x", tone }), "DuotoneIcon")[0].props.size).toBe(22);
    const compact = StateView({ title: "x", tone, compact: true });
    expect(find(compact, "DuotoneIcon")).toHaveLength(0);
    if (tone === "neutral") expect(find(compact, "Icon")).toHaveLength(0);
    else expect(find(compact, "Icon")[0].props.size).toBe(16);
  }
});
it("lays a region out through PanelUI EmptyState Header and Content", () => {
  const tree = StateView({ title: "x", action: { label: "A", onPress: vi.fn() } });
  expect(find(tree, "EmptyStateHeader")).toHaveLength(1);
  expect(find(tree, "EmptyStateContent")).toHaveLength(1);
  expect(find(StateView({ title: "x" }), "EmptyStateContent")).toHaveLength(0);
});
