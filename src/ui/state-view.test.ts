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
vi.mock("./duotone-icon", () => ({ Inbox: "DuotoneIcon", Info: "DuotoneIcon", CircleCheck: "DuotoneIcon", TriangleAlert: "DuotoneIcon", CircleAlert: "DuotoneIcon" }));
vi.mock("./styles", () => ({ uiStyles: { title: {}, grow: {}, stateColumn: { maxWidth: 320 } } }));
vi.mock("./tokens", () => ({ colors: {}, semanticColors: {} }));
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

it("centers a full-area state with art, header title and a primary action", () => {
  const onPress = vi.fn();
  const tree = StateView({ illustration: "unreachable", title: "Can't reach", description: "Retry later", action: { label: "Retry", onPress } });
  expect(find(tree, "Illustration")[0].props).toMatchObject({ name: "unreachable", size: 168 });
  expect(find(tree, "Heading")).toHaveLength(1);
  expect(find(tree, "ActionButton")[0].props).toMatchObject({ action: { label: "Retry" }, tone: "primary" });
});
it("uses the same compact icon row even when the caller supplies full-page art", () => {
  const inline = StateView({ illustration: "error", title: "x", compact: true, tone: "danger" });
  expect(find(inline, "Illustration")).toHaveLength(0);
  expect(find(inline, "Icon")).toHaveLength(1);
});
it("shows a quiet secondary action below the primary one", () => {
  const tree = StateView({ title: "x", action: { label: "A", onPress: vi.fn() }, secondaryAction: { label: "B", onPress: vi.fn() } });
  expect(find(tree, "ActionButton").map((b) => b.props.tone)).toEqual(["primary", "quiet"]);
});
it("uses duotone only for full-region state glyphs", () => {
  for (const tone of ["neutral", "info", "success", "warning", "danger"] as const) {
    expect(find(StateView({ title: "x", tone }), "DuotoneIcon")[0].props.size).toBe(24);
    const compact = StateView({ title: "x", tone, compact: true });
    expect(find(compact, "DuotoneIcon")).toHaveLength(0);
    expect(find(compact, "Icon")[0].props.size).toBe(20);
  }
});
it("lays a region out through PanelUI EmptyState Header and Content", () => {
  const tree = StateView({ title: "x", action: { label: "A", onPress: vi.fn() } });
  expect(find(tree, "EmptyStateHeader")).toHaveLength(1);
  expect(find(tree, "EmptyStateContent")).toHaveLength(1);
  expect(find(StateView({ title: "x" }), "EmptyStateContent")).toHaveLength(0);
});
