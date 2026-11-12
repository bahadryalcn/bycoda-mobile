// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";
const state = vi.hoisted(() => ({
  change: undefined as undefined | ((value: string) => void),
  value: "",
  selectorLabel: "",
  hideLabel: false,
  kind: "",
  width: 320,
  fontScale: 1,
  layout: undefined as undefined | ((event: any) => void),
  labelLayout: undefined as undefined | ((event: any) => void),
}));
vi.mock("react-native", () => ({
  View: ({ children, onLayout }: PropsWithChildren<{ onLayout?: (event: any) => void }>) => {
    state.layout = onLayout; return createElement("div", null, children);
  },
  useWindowDimensions: () => ({ width: state.width, fontScale: state.fontScale }),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./use-reduced-motion", () => ({
  useReducedMotionPreference: () => true,
}));
vi.mock("./typography", () => ({
  Body: ({ children, onLayout }: PropsWithChildren<{ onLayout?: (event: any) => void }>) => {
    state.labelLayout = onLayout; return createElement("span", null, children);
  },
}));
vi.mock("./select-field", () => ({
  SelectField: ({
    value,
    onChange,
    label,
    hideLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    hideLabel?: boolean;
  }) => {
    state.selectorLabel = label;
    state.hideLabel = !!hideLabel;
    state.kind = "selector";
    state.value = value;
    state.change = onChange;
    return null;
  },
}));
vi.mock("panelui-native/components/tabs", () => {
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement("div", null, children);
  return {
    Tabs: Object.assign(
      ({
        children,
        value,
        onValueChange,
      }: PropsWithChildren<{
        value: string;
        onValueChange: (value: string) => void;
      }>) => {
        state.kind = "segments";
        state.value = value;
        state.change = onValueChange;
        return wrapper({ children });
      },
      { List: wrapper, Trigger: wrapper },
    ),
  };
});
it("uses the actual region width and measured label height, retaining the selected value through reflow", () => {
  const node = document.createElement("div"), root = createRoot(node), change = vi.fn();
  const options = ["one", "two", "three"].map((value) => ({ value, label: value }));
  const render = () => act(() => root.render(createElement(SegmentedControl, { label: "View", value: "two", options, onChange: change })));
  try {
    render(); expect(state.kind).toBe("segments");
    act(() => state.layout!({ nativeEvent: { layout: { width: 200 } } })); expect(state.kind).toBe("selector"); expect(state.value).toBe("two");
    act(() => state.layout!({ nativeEvent: { layout: { width: 600 } } })); expect(state.kind).toBe("segments");
    act(() => state.labelLayout!({ nativeEvent: { layout: { height: 80 } } })); expect(state.kind).toBe("selector"); expect(state.value).toBe("two");
    expect(change).not.toHaveBeenCalled();
    act(() => state.layout!({ nativeEvent: { layout: { width: 800 } } })); expect(state.kind).toBe("segments");
  } finally { act(() => root.unmount()); }
});
it.each([3, 5])(
  "preserves selection and guarded callbacks with %s choices",
  (count) => {
    const change = vi.fn();
    const options = Array.from({ length: count }, (_, i) => ({
      value: String(i),
      label: `Choice ${i}`,
      disabled: i === 1,
    }));
    const render = (disabled = false) =>
      renderToStaticMarkup(
        createElement(SegmentedControl, {
          label: "View",
          value: "2",
          options,
          onChange: change,
          disabled,
        }),
      );
    render();
    expect(state.kind).toBe(count > 3 ? "selector" : "segments");
    expect(state.value).toBe("2");
    state.change!("unknown");
    state.change!("1");
    expect(change).not.toHaveBeenCalled();
    state.change!("0");
    expect(change).toHaveBeenCalledExactlyOnceWith("0");
    change.mockClear();
    render(true);
    state.change!("0");
    expect(change).not.toHaveBeenCalled();
    expect(state.value).toBe("2");
  },
);
it("uses the same guarded selection at large system text sizes and restores direct segments at sufficient width", () => {
  const change = vi.fn();
  const options = [{ value: "diff", label: "Diff" }, { value: "blame", label: "Blame", disabled: true }, { value: "history", label: "File history" }];
  const render = () => renderToStaticMarkup(createElement(SegmentedControl, { label: "View", value: "history", options, onChange: change }));
  state.fontScale = 2; render(); expect(state.kind).toBe("selector"); expect(state.value).toBe("history");
  state.change!("blame"); expect(change).not.toHaveBeenCalled(); state.change!("diff"); expect(change).toHaveBeenCalledExactlyOnceWith("diff");
  state.width = 800; render(); expect(state.kind).toBe("segments"); expect(state.value).toBe("history");
  state.width = 320; state.fontScale = 1;
});

it("can omit a repeated visible selector label while retaining its accessible name and selected value",()=>{
 renderToStaticMarkup(createElement(SegmentedControl,{label:"Inbox",hideLabel:true,value:"one",options:["one","two","three","four"].map(value=>({value,label:value})),onChange:vi.fn()}));
 expect(state.kind).toBe("selector");expect(state.hideLabel).toBe(true);expect(state.selectorLabel).toBe("Inbox");expect(state.value).toBe("one");
});
