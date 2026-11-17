// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Input } from "./fields";
import { SearchField } from "./search-field";
import { metrics } from "./tokens";

const state = vi.hoisted(() => ({ fields: [] as Record<string, unknown>[] }));
vi.mock("@/features/keyboard/keyboard-search", () => ({ useKeyboardSearch: () => ({ current: null }) }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  StyleSheet: { hairlineWidth: 1, flatten: (value: unknown) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)) },
  useWindowDimensions: () => ({ width: 320, fontScale: 2 }),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted", accent: "accent" }, semanticColors: {}, uiStyles: { input: { minHeight: metrics.inputHeight }, multiline: { minHeight: metrics.multilineHeight } } }) }));
vi.mock("./typography", () => ({ Body: () => null }));
vi.mock("./feedback", () => ({ FieldError: () => null }));
vi.mock("./motion", () => ({ haptic: { select: vi.fn() } }));
vi.mock("./navigation-row", () => ({ useInNavigationGroup: () => false }));
vi.mock("./info-hint", () => ({ HintLabel: () => null, InfoHint: () => null, InfoPanel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("panelui-native/components/switch", () => ({ Switch: () => null }));
vi.mock("panelui-native/components/input-group", () => ({ InputGroup: {} }));
vi.mock("panelui-native/components/input", () => ({ Input: (props: Record<string, unknown>) => { state.fields.push(props); return null; } }));
vi.mock("panelui-native/components/search-bar", () => ({ SearchBar: (props: Record<string, unknown>) => { state.fields.push(props); return null; } }));
vi.mock("panelui-native/hooks/use-debounced-value", () => ({ useDebouncedValue: (value: string) => value }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; state.fields = []; vi.unstubAllGlobals(); });

it.each([Input, SearchField])("keeps editable fields touchable at 48dp without shrinking text or changing drafts", Control => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const change = vi.fn();
  root = createRoot(document.createElement("div"));
  act(() => root!.render(h(Control, { label: "İstanbul 👩🏽‍💻 العربية", value: "Unsaved draft", onChangeText: change })));
  const field = state.fields.at(-1)!;
  expect((field.style as { minHeight: number }).minHeight).toBeGreaterThanOrEqual(metrics.touchTarget);
  expect(field.value).toBe("Unsaved draft");
  expect(field.accessibilityLabel).toBe("İstanbul 👩🏽‍💻 العربية");
  (field.onChangeText as (value: string) => void)("Changed draft");
  expect(change).toHaveBeenCalledExactlyOnceWith("Changed draft");
});
