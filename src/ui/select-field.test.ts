// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SelectField, MultiSelectField } from "./select-field";
import { PrivateContentAccessProvider } from "./private-access";
const s = vi.hoisted(() => ({ actions: new Map<string, () => void>(), search: undefined as undefined | ((value: string) => void),
  locale: "en", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] as { value: string; label: string; disabled?: boolean }[],
  values: [] as string[], multiple: false, max: undefined as number | undefined, disabled: false, allowed: true, changes: [] as string[][] }));
vi.mock("./theme", () => ({ useMobileTheme: () => {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string, args?: any) => en.replace(/\{(p\d+)\}/g, (_, key) => args?.[key]) }));
vi.mock("@/i18n", () => ({ useLocale: () => s.locale }));
vi.mock("./tokens", () => ({ colors: {}, metrics: {}, opacity: {}, radii: {}, semanticColors: { info: {}, danger: {} }, space: {} }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./disclosure-motion", () => ({ DisclosureChevron: () => null }));
vi.mock("lucide-react-native/icons/chevrons-up-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square-check-big", () => ({ default: () => null }));
vi.mock("react-native", () => ({
  Text: ({ children }: PropsWithChildren) => h("span", null, children), View: ({ children }: PropsWithChildren) => h("div", null, children),
  Pressable: ({ children, accessibilityLabel, accessibilityRole, onPress, disabled }: any) => {
    s.actions.set(accessibilityRole === "combobox" ? "Open" : accessibilityLabel, onPress);
    return h("button", { onClick: onPress, disabled, "data-role": accessibilityRole }, children);
  },
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: any) => h("main", null, ListHeaderComponent,
    data.length ? data.map((item: any) => h("div", { key: item.value }, renderItem({ item }))) : ListEmptyComponent),
}));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("./buttons", () => ({ Button: ({ label, onPress, disabled }: any) => { s.actions.set(label, onPress); return h("button", { onClick: onPress, disabled }, label); } }));
const Search = ({ value, onChangeText }: any) => { s.search = onChangeText; return h("input", { value, onChange: (e: any) => onChangeText(e.target.value) }); };
vi.mock("./fields", () => ({ Input: (props: any) => h(Search, props) }));
vi.mock("./search-field", () => ({ SearchField: (props: any) => h(Search, props) }));
vi.mock("./feedback", () => ({ Empty: ({ title, action }: any) => h("div", null, title, action ? h("button", { onClick: action.onPress }, action.label) : null) }));
vi.mock("./dialogs", () => ({ Sheet: ({ visible, children, onClose, headerAction }: any) => {
  s.actions.set("Close", onClose); return visible ? h("section", null, headerAction, children) : null;
} }));
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
async function render() {
  if (!root) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); }
  const common = { label: "Choice", options: s.options, searchable: true, disabled: s.disabled,
    onChange: (value: string | string[]) => s.changes.push(Array.isArray(value) ? value : [value]) };
  await act(async () => root!.render(h(PrivateContentAccessProvider, { value: { allowed: s.allowed, check: () => s.allowed } },
    s.multiple ? h(MultiSelectField, { ...common, values: s.values, max: s.max }) : h(SelectField, { ...common, value: s.values[0] }))));
}
async function call(name: string) { await act(async () => s.actions.get(name)!()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals();
  s.actions.clear(); s.search = undefined; s.locale = "en"; s.options = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];
  s.values = []; s.max = undefined; s.multiple = s.disabled = false; s.allowed = true; s.changes = [];
});
it("retires row events after close and a later reopening", async () => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!; await call("Close");
  await act(async () => old()); expect(s.changes).toEqual([]); await call("Open"); await act(async () => old()); expect(s.changes).toEqual([]);
  await call("Alpha"); expect(s.changes).toEqual([["a"]]);
});
it("retires row events when filtering hides the option", async () => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!; await act(async () => s.search!("Beta"));
  await act(async () => old()); expect(s.changes).toEqual([]);
});
it.each(["removed", "disabled"])("retires an option that becomes %s", async kind => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!;
  s.options = kind === "removed" ? [s.options[1]] : [{ ...s.options[0], disabled: true }, s.options[1]]; await render();
  await act(async () => old()); expect(s.changes).toEqual([]);
});
it("retires selection events when the component unmounts", async () => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!; await act(async () => root!.unmount()); root = undefined;
  await act(async () => old()); expect(s.changes).toEqual([]);
});
it.each(["disabled", "private"])("closes on %s loss without reviving old events or reopening automatically", async kind => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!;
  if (kind === "disabled") s.disabled = true; else s.allowed = false; await render(); expect(container.querySelector("section")).toBeNull();
  s.disabled = false; s.allowed = true; await render(); expect(container.querySelector("section")).toBeNull();
  await call("Open"); await act(async () => old()); expect(s.changes).toEqual([]);
});
it("does not let an old clear callback wipe a newer controlled selection", async () => {
  s.multiple = true; s.values = ["a"]; await render(); await call("Open"); const clear = s.actions.get("Clear selection")!;
  s.values = ["a", "b"]; await render(); await act(async () => clear()); expect(s.changes).toEqual([]);
  await call("Clear selection"); expect(s.changes).toEqual([[]]);
});
it("accepts batched typing with Turkish matching and keeps search outside the list", async () => {
  s.locale = "tr"; s.options = [{ value: "a", label: "İLETİŞİM" }, { value: "b", label: "Other" }]; await render(); await call("Open");
  const input = container.querySelector("input"), change = s.search!; await act(async () => { change("ile"); change("iletişim"); });
  expect(container.querySelector("input")).toBe(input); expect(container.querySelectorAll('button[data-role="radio"]')).toHaveLength(1);
  expect(container.querySelector('main input')).toBeNull();
});
it("keeps missing saved choices while allowing removal at the limit and adding a current choice", async () => {
  s.multiple = true; s.max = 2; s.values = ["a", "missing-saved-choice"]; await render(); await call("Open");
  await call("Beta"); expect(s.changes).toEqual([]); await call("Alpha"); expect(s.changes).toEqual([["missing-saved-choice"]]);
  expect(s.values).toEqual(["a", "missing-saved-choice"]); s.values = s.changes[0]; await render();
  await call("Beta"); expect(s.changes.at(-1)).toEqual(["missing-saved-choice", "b"]); expect(container.querySelector("section")).not.toBeNull();
});
it("sends a single selection once when two row events arrive before a commit", async () => {
  await render(); await call("Open"); const choose = s.actions.get("Alpha")!;
  await act(async () => { choose(); choose(); }); expect(s.changes).toEqual([["a"]]); expect(container.querySelector("section")).toBeNull();
});
it("retires old search and Done callbacks across reopening", async () => {
  s.multiple = true; await render(); await call("Open"); const change = s.search!, done = s.actions.get("Done")!;
  await call("Done"); await call("Open"); await act(async () => { change("retired"); done(); });
  expect(container.querySelector("input")!.value).toBe(""); expect(container.querySelector("section")).not.toBeNull();
});
it("checks private authority before React commits", async () => {
  await render(); await call("Open"); const old = s.actions.get("Alpha")!; s.allowed = false;
  await act(async () => old()); expect(s.changes).toEqual([]);
});
