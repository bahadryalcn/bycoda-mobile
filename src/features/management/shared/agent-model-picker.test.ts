// @vitest-environment happy-dom
import { act, createElement as h, StrictMode, type ComponentProps, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentModelPicker } from "./agent-model-picker";

const state = vi.hoisted(() => ({ rows: new Map<string, () => void>(), search: null as null | ((text: string) => void), close: null as null | (() => void) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/use-list-scroll-memory", () => ({ useFilteredListScrollMemory: () => ({ listProps: {} }) }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("div", null, children), Button: () => null, QueryState: () => null,
  Sheet: ({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) => { state.close = onClose; return visible ? h("div", null, children) : null; },
  SearchField: ({ onChangeText }: { onChangeText: (text: string) => void }) => { state.search = onChangeText; return null; },
  NavigationRow: ({ label, onPress }: { label: string; onPress: () => void }) => { state.rows.set(label, onPress); return null; },
  ScreenList: ({ data, renderItem }: { data: unknown[]; renderItem: (row: { item: unknown }) => import("react").ReactNode }) => h("div", null, data.map((item, index) => h("div", { key: index }, renderItem({ item })))),
}));
let root: ReturnType<typeof createRoot>, props: ComponentProps<typeof AgentModelPicker>;
const select = vi.fn(), close = vi.fn();
const render = () => act(async () => root.render(h(StrictMode, null, h(AgentModelPicker, props))));
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(document.createElement("div")); props = { catalog: { models: { codex: [{ id: "first", name: "First", harness: "codex", settings: [] }, { id: "second", name: "Second", harness: "codex", settings: [] }] }, errors: {} }, query: { isSuccess: true }, harness: "codex", selected: "private/custom", onSelect: select, onClose: close, returnFocusRef: undefined }; });
afterEach(async () => { await act(async () => root.unmount()); state.rows.clear(); state.search = null; state.close = null; vi.clearAllMocks(); vi.unstubAllGlobals(); });

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
