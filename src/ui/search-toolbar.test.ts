// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const bars = vi.hoisted(() => ({ props: [] as Record<string, any>[], actions: [] as Record<string, any>[] }));
vi.mock("@/features/keyboard/keyboard-search", () => ({ useKeyboardSearch: () => ({ current: null }) }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  StyleSheet: { flatten: (value: unknown) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)) },
  useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted", accent: "accent" }, uiStyles: { input: {} } }) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./buttons", () => ({
  IconButton: ({ label, expanded, onPress }: any) => h("button", { "aria-label": label, "aria-expanded": String(!!expanded), onClick: onPress }),
}));
vi.mock("./filter-sheet", () => ({
  FilterButton: ({ label, count, onPress }: any) => h("button", { "aria-label": label, "data-count": String(count), onClick: onPress }),
}));
vi.mock("./dialogs", () => ({
  Sheet: ({ title, children, onClose }: any) => h("section", { "aria-label": title, "data-close": "", onClick: undefined }, children, h("button", { "aria-label": "Close sheet", onClick: onClose })),
  FormActions: (props: any) => { bars.actions.push(props); return h("footer", null,
    props.cancelLabel ? h("button", { "aria-label": props.cancelLabel, onClick: props.onCancel }) : null,
    h("button", { "aria-label": props.submitLabel, onClick: props.onSubmit })); },
}));
vi.mock("panelui-native/components/search-bar", () => ({
  SearchBar: (props: Record<string, any>) => { bars.props.push(props); return h("input", { "aria-label": props.accessibilityLabel, value: props.value, readOnly: true }); },
}));
vi.mock("panelui-native/hooks/use-debounced-value", () => ({ useDebouncedValue: (value: string) => value }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
import { SearchField, useCollapsibleSearch } from "./search-field";

let setQuery: (value: string) => void;
let setStatus: (value: string) => void;
function Page() {
  const [query, set] = useState("");
  const [status, setS] = useState("all");
  setQuery = set; setStatus = setS;
  const collection = useCollapsibleSearch(h(SearchField, { label: "Search tasks", value: query, onChangeText: set }), {
    filters: h("p", null, `Status ${status}`),
    filtersLabel: "Status",
    activeFilters: status === "all" ? 0 : 1,
    onResetFilters: () => setS("all"),
  });
  return h("main", null, h("nav", null, collection.trigger, collection.filterTrigger, h("button", { "aria-label": "New task" })), collection.sheet);
}
const host = document.createElement("div");
const root = createRoot(host);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const button = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const sheet = () => host.querySelector("section");
afterEach(() => { act(() => root.render(null)); bars.props = []; bars.actions = []; });

it("keeps search, filter and create in the heading row and opens one sheet with no page row", () => {
  act(() => root.render(h(Page)));
  expect([...host.querySelectorAll("nav button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Search tasks", "Status", "New task"]);
  expect(sheet()).toBeNull();
  expect(host.querySelector("input")).toBeNull();
  act(() => button("Search tasks").click());
  expect(sheet()?.getAttribute("aria-label")).toBe("Filters");
  // Search on top, the filters below, the keyboard focused once on the field.
  expect(sheet()?.textContent).toContain("Status all");
  expect(bars.props.at(-1)!.autoFocus).toBe(true);
  expect(bars.props.at(-1)!.cancel).toBe("never");
  // Nothing is applied yet, so only Done is offered.
  expect(bars.actions.at(-1)!.cancelLabel).toBeUndefined();
  act(() => button("Done").click());
  expect(sheet()).toBeNull();
});

it("opens from the filter icon without focusing search, shows applied filters and resets live", () => {
  act(() => root.render(h(Page)));
  act(() => setStatus("blocked"));
  expect(button("Status").dataset.count).toBe("1");
  act(() => button("Status").click());
  expect(bars.props.at(-1)!.autoFocus).toBe(false);
  act(() => setQuery("deploy"));
  act(() => button("Reset").click());
  expect(bars.props.at(-1)!.value).toBe("");
  expect(sheet()?.textContent).toContain("Status all");
});
