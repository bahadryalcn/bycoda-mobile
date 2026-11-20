// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Input } from "./fields";

// Focus must change only the border color. A border-width change on focus resizes the
// content box and shifts the text by a sub-pixel (issue #441).
const state = vi.hoisted(() => ({ fields: [] as Record<string, unknown>[] }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  StyleSheet: { hairlineWidth: 1, flatten: (value: unknown) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)) },
}));
vi.mock("./theme", () => ({
  useMobileTheme: () => ({
    colors: { muted: "muted", accent: "accent", text: "text", border: "border" },
    semanticColors: { danger: { border: "danger-border", text: "danger-text" } },
    // Base width stands in for uiStyles.input; focus must inherit it, never override it.
    uiStyles: { input: { borderWidth: 0.5, borderColor: "border" }, multiline: {}, mono: { fontFamily: "mono" } },
  }),
}));
vi.mock("./typography", () => ({ Body: () => null }));
vi.mock("./feedback", () => ({ FieldError: () => null }));
vi.mock("./motion", () => ({ haptic: { select: vi.fn() } }));
vi.mock("./navigation-row", () => ({ useInNavigationGroup: () => false }));
vi.mock("./info-hint", () => ({ HintLabel: () => null, InfoHint: () => null, InfoPanel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("./tokens", () => ({ metrics: {}, opacity: {}, space: { md: 12, sm: 6, xs: 4 }, gapIcon: 8 }));
vi.mock("panelui-native/components/switch", () => ({ Switch: () => null }));
vi.mock("panelui-native/components/input-group", () => ({ InputGroup: {} }));
vi.mock("panelui-native/components/input", () => ({
  Input: (props: Record<string, unknown>) => {
    state.fields.push(props);
    return null;
  },
}));

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  state.fields = [];
  vi.unstubAllGlobals();
});

function render(props: Record<string, unknown>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  act(() => root!.render(h(Input, { label: "Name", value: "Draft", onChangeText: vi.fn(), ...props })));
  return state.fields.at(-1)!;
}

function resolvedStyle(field: Record<string, unknown>) {
  return Object.assign({}, ...[field.style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;
}

it("keeps the border width identical in the rest and focused states", () => {
  const field = render({});
  const rest = resolvedStyle(field);
  act(() => (field.onFocus as (event: unknown) => void)({}));
  const focused = resolvedStyle(state.fields.at(-1)!);
  expect(focused.borderWidth).toBe(rest.borderWidth);
  expect(focused.borderColor).toBe("accent");
});

it("uses the danger text color for a focused invalid field without changing its width", () => {
  const field = render({ error: "Required" });
  act(() => (field.onFocus as (event: unknown) => void)({}));
  const focused = resolvedStyle(state.fields.at(-1)!);
  expect(focused.borderWidth).toBe(0.5);
  expect(focused.borderColor).toBe("danger-text");
});

it("keeps the disabled text color and the caller's width-free style on focus", () => {
  const field = render({ editable: false, style: { marginTop: 4 } });
  act(() => (field.onFocus as (event: unknown) => void)({}));
  const focused = resolvedStyle(state.fields.at(-1)!);
  expect(focused.color).toBe("muted");
  expect(focused.marginTop).toBe(4);
  expect(focused.borderWidth).toBe(0.5);
});
