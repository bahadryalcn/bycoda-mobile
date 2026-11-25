import { expect, it, vi } from "vitest";
function flatten(value: any): any { return Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value ?? {}; }
const window = vi.hoisted(() => ({ width: 700, fontScale: 1 }));
vi.mock("react", async (load) => ({ ...await load<typeof import("react")>(), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", StyleSheet: { flatten }, useWindowDimensions: () => window }));
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
  const [, frame] = editor.props.children;
  const [field] = frame.props.children;
  expect(view.props.value).toBe("Draft");
  expect(view.props.onValueChange).toBe(change);
  expect(view.props.avoidKeyboard).toBe(false);
  expect(field.props.onSelectionChange).toBe(selection);
  const measured = { nativeEvent: { layout: { width: 540, height: 48 } } };
  row.props.onLayout(measured);
  expect(layout).toHaveBeenCalledWith(measured);
  const style = flatten(field.props.style);
  expect(style.minHeight + frame.props.style.paddingVertical * 2).toBe(48);
  expect(style.paddingTop).toBe(0);
  expect(style.maxHeight).toBeGreaterThan(40 * 2);
});
it("colors the placeholder with the muted text token that is contrast-tested on the raised capsule", () => {
  const [field] = render().props.children[1].props.children[1].props.children;
  expect(field.props.placeholderTextColor).toBe("#111111");
});
it("locks the field when disabled and lets the feature cap the height", () => {
  const view = render({ disabled: true, field: { style: { maxHeight: 90 } } });
  const frame = view.props.children[1].props.children[1];
  const [field] = frame.props.children;
  expect(view.props.disabled).toBe(true);
  expect(field.props.style.maxHeight + frame.props.style.paddingVertical * 2).toBe(89);
});

it("presents one iOS accessibility name when the placeholder duplicates it", () => {
  vi.stubEnv("EXPO_OS", "ios");
  try {
    const field = { accessibilityLabel: "Mesaj", placeholder: "Mesaj" };
    const [input, hint] = render({ value: "", field }).props.children[1].props.children[1].props.children;
    expect(input.props.accessibilityLabel).toBe("Mesaj");
    expect(input.props.placeholder).toBe("");
    expect(hint.props.accessibilityElementsHidden).toBe(true);
    expect(hint.props.children.props.children).toBe("Mesaj");
    const [, filledHint] = render({ field }).props.children[1].props.children[1].props.children;
    expect(filledHint).toBeNull();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("uses the native text scale for the scroll viewport at smaller system sizes", () => {
  window.fontScale = 0.9;
  try {
    const [field] = render().props.children[1].props.children[1].props.children;
    expect(field.props.style.maxHeight).toBe(95);
  } finally {
    window.fontScale = 1;
  }
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
  expect(compactField.props.children[0].type).toBe(normalField.props.children[0].type);
  expect(compact[1].props.style.flexDirection).toBe("row");
  expect(inline.props.children).toBe("Send");
  const trailing = compact[2].props.children[3];
  expect(trailing.props.children.slice(1)).toEqual(["Dictate", null]);
});

it("shows one non-wrapping toolbar at rest with the model as the flexible middle", () => {
  const toolbar = render({ value: "", leading: "Add", model: "Model", secondarySubmit: "Dictate", submit: "Send" }).props.children[2];
  const [leading, model, status, trailing] = toolbar.props.children;
  expect(flatten(toolbar.props.style).flexWrap).toBe("nowrap");
  expect(flatten(toolbar.props.style).display).toBeUndefined();
  expect(leading.props.children).toBe("Add");
  expect(model.props.style.flex).toBe(1);
  expect(model.props.children).toBe("Model");
  expect(status).toBeNull();
  expect(trailing.props.children.slice(1)).toEqual(["Dictate", "Send"]);
});

it("puts Add beside the field at short heights, or keeps Add below a dedicated draft recovery action", () => {
  const props = { leading: "Add", submit: "Send", inlineSubmit: true };
  const compact = render(props).props.children;
  expect(compact[1].props.children[0].props.children).toBe("Add");
  expect(compact[2].props.children[0].props.children).toBeNull();
  const blocked = render({ ...props, inlineLeading: "Review draft" }).props.children;
  expect(blocked[1].props.children[0].props.children).toBe("Review draft");
  expect(blocked[2].props.children[0].props.children).toBe("Add");
});

it("asks the model for its mark-only form when the measured chip is short", () => {
  const model = vi.fn(({ iconOnly }: { iconOnly: boolean }) => (iconOnly ? "Mark" : "Mark Model"));
  const at = (width: number, fontScale: number) => {
    window.width = width;
    window.fontScale = fontScale;
    return render({ model, leading: "Add", submit: "Send" }).props.children[2].props.children[1].props.children;
  };
  try {
    // Unmeasured controls: the window width alone leaves the label room at default text.
    expect(at(398, 1)).toBe("Mark Model");
    expect(at(288, 2)).toBe("Mark Model");
  } finally {
    window.width = 700;
    window.fontScale = 1;
  }
});

it("adds the context status between the model and the trailing controls when there is room", () => {
  const toolbar = render({ model: "Model", status: "Ring", leading: "Add", submit: "Send" }).props.children[2];
  expect(toolbar.props.children[2].props.children).toBe("Ring");
});
