// @vitest-environment happy-dom
import { act, createElement as h, StrictMode, type ComponentProps, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentModelPicker } from "./agent-model-picker";
import { AgentFields } from "./agent-fields";

const state = vi.hoisted(() => ({ rows: new Map<string, () => void>(), search: null as null | ((text: string) => void), close: null as null | (() => void), returnFocusRef: undefined as unknown }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/duotone-icon", () => ({ Cpu: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/provider-identity", () => ({ providerSelectionOption: (provider: string) => ({ value: provider, label: provider }) }));
vi.mock("@/ui/number-field", () => ({ NumberField: () => null }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => undefined }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({ data: props.catalog, isSuccess: true }) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/use-list-scroll-memory", () => ({ useFilteredListScrollMemory: () => ({ listProps: {} }) }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("div", null, children), Button: () => null, QueryState: () => null,
  Disclosure: () => null, ErrorText: () => null, IdentifierField: () => null, SelectField: () => null,
  Sheet: ({ visible, onClose, children, returnFocusRef }: PropsWithChildren<{ visible: boolean; onClose: () => void; returnFocusRef?: unknown }>) => {
    state.close = onClose;
    state.returnFocusRef = returnFocusRef;
    return visible ? h("div", null, children) : null;
  },
  SearchField: ({ onChangeText }: { onChangeText: (text: string) => void }) => { state.search = onChangeText; return null; },
  NavigationRow: ({ label, onPress, ref }: { label: string; onPress: () => void; ref?: import("react").Ref<HTMLButtonElement> }) => {
    state.rows.set(label, onPress);
    return h("button", { ref, onClick: onPress }, label);
  },
  ScreenList: ({ data, renderItem }: { data: unknown[]; renderItem: (row: { item: unknown }) => import("react").ReactNode }) => h("div", null, data.map((item, index) => h("div", { key: index }, renderItem({ item })))),
}));
let root: ReturnType<typeof createRoot>, props: ComponentProps<typeof AgentModelPicker>;
const select = vi.fn(), close = vi.fn();
const render = () => act(async () => root.render(h(StrictMode, null, h(AgentModelPicker, props))));
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(document.createElement("div")); props = { catalog: { models: { codex: [{ id: "first", name: "First", harness: "codex", settings: [] }, { id: "second", name: "Second", harness: "codex", settings: [] }] }, errors: {} }, query: { isSuccess: true }, harness: "codex", selected: "private/custom", onSelect: select, onClose: close, returnFocusRef: undefined }; });
afterEach(async () => { await act(async () => root.unmount()); state.rows.clear(); state.search = null; state.close = null; state.returnFocusRef = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("returns focus to the model row that opened the management picker", async () => {
  const editor = document.createElement("div");
  await act(async () => root.unmount());
  root = createRoot(editor);
  await act(async () => root.render(h(AgentFields, {
    value: { harness: "codex", model: "first", modelSettings: {}, runtimeMode: "supervised", maxRunMinutes: 0 },
    onChange: vi.fn(),
  })));
  const trigger = editor.querySelector("button");
  expect(trigger?.textContent).toBe("Model");
  await act(async () => trigger?.click());
  expect(state.returnFocusRef).toMatchObject({ current: trigger });
  await act(async () => state.close?.());
  expect(editor.querySelector("button")).toBe(trigger);
});

it("retires filtered rows and emits a current choice only once", async () => {
  await render(); const old = state.rows.get("Second")!; await act(async () => state.search!("First"));
  await act(async () => old()); expect(select).not.toHaveBeenCalled();
  const current = state.rows.get("First")!; await act(async () => { current(); current(); });
  expect(select).toHaveBeenCalledExactlyOnceWith("first"); expect(close).toHaveBeenCalledOnce();
});

it("retires rows removed by a catalogue refresh without changing the draft", async () => {
  await render(); const old = state.rows.get("Second")!;
  props = { ...props, catalog: { models: { codex: [] }, errors: {} } }; await render();
  await act(async () => old()); expect(select).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

it.each(["disabled", "provider"])("does not revive old choices after %s loss and recovery", async mode => {
  await render(); const old = state.rows.get("First")!;
  props = mode === "disabled" ? { ...props, disabled: true } : { ...props, harness: "claude" }; await render();
  props = { ...props, disabled: false, harness: "codex" }; await render(); await act(async () => old());
  expect(select).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});

it("retires row, input and close callbacks from an unmounted opening", async () => {
  await render(); const row = state.rows.get("First")!, search = state.search!, oldClose = state.close!;
  await act(async () => root.unmount()); root = createRoot(document.createElement("div")); await render();
  await act(async () => { row(); search("Second"); oldClose(); });
  expect(select).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
