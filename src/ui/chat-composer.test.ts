import { expect, it, vi } from "vitest";
function flatten(value: any): any { return Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value ?? {}; }
const window = vi.hoisted(() => ({ width: 700, fontScale: 1 }));
vi.mock("react", async (load) => ({ ...await load<typeof import("react")>(), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock("react-native", () => ({ View: "View", useWindowDimensions: () => window }));
vi.mock("panelui-native/components/ai-input", () => ({ AIInput: Object.assign(() => null, { Field: () => null, Toolbar: () => null, Spacer: () => null }) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: { muted: "#111111", tertiary: "#222222" }, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./composer-actions", () => ({ ComposerActionArea: () => null }));
import { ChatComposer } from "./chat-composer";
const render = (props: Partial<Parameters<typeof ChatComposer>[0]> = {}) =>
  ChatComposer({ value: "Draft", onValueChange: () => {}, leading: null, submit: null, field: {}, ...props });
it("starts as a 48dp multiline field that grows to five lines, with exact field callbacks", () => {
  const selection = vi.fn(), change = vi.fn(), layout = vi.fn();
  const view = render({ onValueChange: change, onToolbarLayout: layout, field: { onSelectionChange: selection } });
  const [, editor, row] = view.props.children;
  const [, field] = editor.props.children;
  expect(view.props.value).toBe("Draft");
  expect(view.props.onValueChange).toBe(change);
  expect(view.props.avoidKeyboard).toBe(false);
  expect(field.props.onSelectionChange).toBe(selection);
  const measured = { nativeEvent: { layout: { width: 540, height: 48 } } };
  row.props.onLayout(measured);
  expect(layout).toHaveBeenCalledWith(measured);
  const style = flatten(field.props.style);
  expect(style.minHeight).toBe(48);
  expect(style.maxHeight).toBeGreaterThan(40 * 2);
});
it("colors the placeholder with the muted text token that is contrast-tested on the raised capsule", () => {
  const field = render().props.children[1].props.children[1];
  expect(field.props.placeholderTextColor).toBe("#111111");
});
it("locks the field when disabled and lets the feature cap the height", () => {
  const view = render({ disabled: true, field: { style: { maxHeight: 90 } } });
  const field = view.props.children[1].props.children[1];
  expect(view.props.disabled).toBe(true);
  expect(flatten(field.props.style).maxHeight).toBe(90);
});
it("renders attachments and notes inside the capsule above the field", () => {
  const view = render({ top: "TOP" });
  expect(view.props.children[0]).toBe("TOP");
});

it("keeps the same field mounted alongside the primary actions in a short keyboard frame", () => {
  const props = { submit: "Send", secondarySubmit: "Dictate", model: "Model" };
  const normal = render(props).props.children;
  const compact = render({ ...props, inlineSubmit: true }).props.children;
  const [, normalField] = normal[1].props.children;
  const [, compactField, inline] = compact[1].props.children;
  expect(compactField.type).toBe(normalField.type);
  expect(compact[1].props.style.flexDirection).toBe("row");
  expect(inline.props.children).toBe("Send");
  expect(compact[2].props.children[1].props.children.slice(1)).toEqual(["Dictate", null]);
});

it("puts Add beside the field at short heights, or keeps Add below a dedicated draft recovery action", () => {
  const props = { leading: "Add", submit: "Send", inlineSubmit: true };
  const compact = render(props).props.children;
  expect(compact[1].props.children[0].props.children).toBe("Add");
  expect(compact[2].props.children[0][0].props.children[0]).toBeNull();
  const blocked = render({ ...props, inlineLeading: "Review draft" }).props.children;
  expect(blocked[1].props.children[0].props.children).toBe("Review draft");
  expect(blocked[2].props.children[0][0].props.children[0]).toBe("Add");
});

it("gives the model its own row at large text sizes and keeps its key on expansion", () => {
  function layout() { return render({ model: "Selected model", leading: "Attach", submit: "Send" }).props.children[2]; }
  window.width = 427;
  window.fontScale = 1.5;
  try {
    const compact = layout();
    const [model, leading] = compact.props.children[0];
    expect(compact.props.style.flexWrap).toBe("wrap");
    expect(model.props.style.flexBasis).toBe("100%");
    expect(leading.key).toBe("leading");
    expect(compact.props.children[1].props.children[2]).toBe("Send");
    expect(compact.props.children[1].props.style.marginStart).toBe("auto");
    window.width = 440;
    window.fontScale = 1;
    expect(layout().props.style.flexWrap).toBe("wrap");
    window.width = 640;
    const wide = layout();
    expect(wide.props.style.flexWrap).toBe("nowrap");
    expect(wide.props.children[0][1].key).toBe(model.key);
  } finally {
    window.width = 700;
    window.fontScale = 1;
  }
});
