// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Sheet, FormActions } from "./dialogs";

type NativeStyle = Record<string, unknown> | NativeStyle[] | undefined;
const fixture = vi.hoisted(() => ({ measurements: [] as ((event: { nativeEvent: { layout: { height: number } } }) => void)[] }));
function flatten(style: NativeStyle): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
}
vi.mock("react-native", () => ({
  View: ({ children, style, onLayout }: PropsWithChildren<{ style?: NativeStyle; onLayout?: typeof fixture.measurements[number] }>) => {
    if (onLayout) fixture.measurements.push(onLayout);
    return createElement("div", { "data-style": JSON.stringify(flatten(style)) }, children);
  },
  ScrollView: ({ children, style }: PropsWithChildren<{ style?: NativeStyle }>) => createElement("div", { "data-scroll": true, "data-style": JSON.stringify(flatten(style)) }, children),
  Pressable: () => null,
  StyleSheet: { hairlineWidth: 1 },
  useWindowDimensions: () => ({ height: 640, fontScale: 2 }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("article", null, children) },
  useAnimatedStyle: () => ({}),
}));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: ({ children }: PropsWithChildren) => children,
  useKeyboardState: (select: (state: { isVisible: boolean }) => unknown) => select({ isVisible: true }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 24, left: 0 }) }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: { grow: { flex: 1 }, header: {}, title: {}, content: {} } }) }));
vi.mock("./tokens", () => ({ metrics: { touchTarget: 48, inputHeight: 48, contentWidth: 760 }, radii: {}, space: { sm: 6, xs: 4, md: 12, lg: 16, xl: 20, screen: 16 } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./overlays", () => ({ ScreenOverlay: ({ children }: PropsWithChildren) => children, useOverlayProgress: () => null }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("p", null, children), Heading: ({ children }: PropsWithChildren) => createElement("h2", null, children) }));
vi.mock("./buttons", () => ({ Button: () => null, IconButton: () => createElement("button", null, "Close") }));
vi.mock("./layout", () => ({ Card: ({ children }: PropsWithChildren) => children, Row: ({ children }: PropsWithChildren) => children }));
vi.mock("./sheet-guard", async () => {
  const { createContext } = await import("react");
  return {
    SheetGuardContext: createContext(null),
    useSheetGuards: () => ({ pending: false, dirty: false, register: () => () => {} }),
    useSheetDismissal: () => ({ confirming: false, requestClose: () => {}, requestCloseThen: () => {} }),
  };
});
vi.mock("./use-native-sheet-focus", () => ({ useNativeSheetFocus: () => {} }));
vi.mock("./form-action-row", () => ({ FormActionRow: ({ submitLabel, feedback }: { submitLabel: string; feedback?: React.ReactNode }) => createElement("footer", null, createElement("button", null, submitLabel), feedback) }));
vi.mock("./unsaved-badge", () => ({ UnsavedBadge: () => createElement("p", null, "Unsaved changes") }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount()); root = undefined;
  fixture.measurements.length = 0;
  vi.unstubAllGlobals();
});

it("reserves header space above a scrollable editor and keeps actions outside the body", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root!.render(createElement(Sheet, {
    visible: true, title: "Edit queued message", onClose: () => {}, dirty: true,
  }, createElement("textarea", { defaultValue: "Retained draft" }), createElement(FormActions, {
    submitLabel: "Save changes", onSubmit: () => {}, feedback: createElement("p", null, "Queue is controlled elsewhere"),
  }))));
  const body = container.querySelector("textarea")!.parentElement!;
  expect(body.getAttribute("data-scroll")).toBe("true");
  expect(body.querySelector("h2")).toBeNull();
  expect(body.querySelector("footer")).toBeNull();
  expect(container.querySelector("footer")!.textContent).toContain("Save changes");
  expect(container.querySelector("footer")!.textContent).toContain("Queue is controlled elsewhere");
  expect(container.textContent).toContain("Unsaved changes");
  const [measureFrame, measureHeader] = fixture.measurements;
  await act(async () => {
    measureFrame!({ nativeEvent: { layout: { height: 300 } } });
    measureHeader!({ nativeEvent: { layout: { height: 96 } } });
  });
  expect(JSON.parse(body.getAttribute("data-style")!)).toMatchObject({ minHeight: 94.5 });
  const actions = container.querySelector("footer")!.parentElement!;
  expect(JSON.parse(actions.getAttribute("data-style")!)).toMatchObject({ maxHeight: 94.5, flexShrink: 0 });
});
