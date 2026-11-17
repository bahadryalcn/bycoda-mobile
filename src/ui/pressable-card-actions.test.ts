import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("react-native", () => ({ Pressable: "pressable", View: "view", StyleSheet: { flatten: (style: unknown) => style } }));
vi.mock("panelui-native/primitives/animated-pressable", () => ({ AnimatedPressable: "pressable" }));
vi.mock("panelui-native/components/chip", () => ({ Chip: "chip" }));
vi.mock("panelui-native/components/progress-button", () => ({ ProgressButton: "progress-button" }));
vi.mock("./busy-indicator", () => ({ LifecycleButton: "button" }));
vi.mock("./spinner-claim", () => ({ useSoleSpinner: () => false }));
vi.mock("lucide-react-native/icons/check", () => ({ default: "check" }));
vi.mock("./typography", () => ({ Body: "body" }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {}, pressedFill: "" }) }));
vi.mock("./motion", () => ({ haptic: { select: vi.fn() } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./design-system", () => ({ controlClasses: () => "" }));
vi.mock("./use-hover", () => ({ useHover: () => ({ hovered: false, handlers: {} }) }));
import { PressableCard } from "./buttons";
it("disabled cards cannot invoke their long-press command through accessibility actions", () => {
  const open = vi.fn();
  const card = PressableCard({ label: "Project", disabled: true, onPress: vi.fn(), onLongPress: open, optionsLabel: "Project actions" }) as ReactElement<{ onAccessibilityAction(event: { nativeEvent: { actionName: string } }): void }>;
  card.props.onAccessibilityAction({ nativeEvent: { actionName: "longpress" } });
  expect(open).not.toHaveBeenCalled();
});
it("enabled cards keep their explicit accessibility action", () => {
  const open = vi.fn();
  const card = PressableCard({ label: "Project", onPress: vi.fn(), onLongPress: open, optionsLabel: "Project actions" }) as ReactElement<{ onAccessibilityAction(event: { nativeEvent: { actionName: string } }): void }>;
  card.props.onAccessibilityAction({ nativeEvent: { actionName: "longpress" } });
  expect(open).toHaveBeenCalledOnce();
});
