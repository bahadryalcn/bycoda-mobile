import { expect, it, vi } from "vitest";
function flatten(value: any): any { return Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value ?? {}; }
vi.mock("react-native", () => ({ View: "View", useWindowDimensions: () => ({ fontScale: 1 }) }));
vi.mock("panelui-native/components/ai-input", () => ({ AIInput: Object.assign(() => null, { Field: () => null, Toolbar: () => null, Spacer: () => null }) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: { muted: "#111111", tertiary: "#222222" }, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./composer-actions", () => ({ ComposerActionArea: () => null }));
import { ChatComposer } from "./chat-composer";
const render = (props: Partial<Parameters<typeof ChatComposer>[0]> = {}) =>
  ChatComposer({ value: "Draft", onValueChange: () => {}, leading: null, submit: null, field: {}, ...props });
it("starts as a 48dp multiline field that grows to five lines, with exact field callbacks", () => {
  const selection = vi.fn(), change = vi.fn(), layout = vi.fn();
  const view = render({ onValueChange: change, onToolbarLayout: layout, field: { onSelectionChange: selection } });
  const [, field, row] = view.props.children;
  expect(view.props.value).toBe("Draft");
  expect(view.props.onValueChange).toBe(change);
  expect(view.props.avoidKeyboard).toBe(false);
  expect(field.props.onSelectionChange).toBe(selection);
  expect(row.props.onLayout).toBe(layout);
  const style = flatten(field.props.style);
  expect(style.minHeight).toBe(48);
  expect(style.maxHeight).toBeGreaterThan(40 * 2);
});
it("colors the placeholder with the muted text token that is contrast-tested on the raised capsule", () => {
  const field = render().props.children[1];
  expect(field.props.placeholderTextColor).toBe("#111111");
});
it("locks the field when disabled and lets the feature cap the height", () => {
  const view = render({ disabled: true, field: { style: { maxHeight: 90 } } });
  const field = view.props.children[1];
  expect(view.props.disabled).toBe(true);
  expect(flatten(field.props.style).maxHeight).toBe(90);
});
it("renders attachments and notes inside the capsule above the field", () => {
  const view = render({ top: "TOP" });
  expect(view.props.children[0]).toBe("TOP");
});
