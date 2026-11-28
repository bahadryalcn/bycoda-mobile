// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ props: {} as any, refresh: {} as any }));
vi.mock("react-native", () => ({
  FlatList: (props: any) => { fixture.props = props; return props.refreshControl ?? null; },
  RefreshControl: (props: any) => { fixture.refresh = props; return null; }, View: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./tokens", () => ({ colors: {}, space: {}, metrics: {} }));
vi.mock("./styles", () => ({ uiStyles: {} }));
const heading = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("./layout", () => ({ useScreenHeading: (props: Record<string, unknown>) => { heading.props = props; return null; }, useScreenChrome: () => ({ bottomSafeArea: false }) }));
import { ScreenList } from "./screen-list";
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
it("uses an external controller without requiring or leaking a query or refresh callback", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const onRefresh = vi.fn(async () => {}), state = { refreshing: true, onRefresh };
  act(() => root!.render(createElement(ScreenList, { data: [], renderItem: () => null, refreshState: state })));
  expect(fixture.refresh.refreshing).toBe(true); expect(fixture.refresh.onRefresh).toBe(onRefresh);
  expect(fixture.props).not.toHaveProperty("refreshState");
  act(() => root!.render(createElement(ScreenList, { data: [], renderItem: () => null, refreshState: { ...state, refreshing: false } })));
  expect(fixture.refresh.refreshing).toBe(false); expect(fixture.refresh.onRefresh).toBe(onRefresh);
});

it("lets empty and loading states occupy the remaining list viewport", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const empty = createElement("span", null, "Loading");
  act(() => root!.render(createElement(ScreenList, { data: [], renderItem: () => null, ListEmptyComponent: empty })));
  expect(fixture.props.ListEmptyComponent.props.style.flexGrow).toBe(1);
  expect(fixture.props.ListEmptyComponent.props.collapsable).toBe(false);
  expect(fixture.props.ListEmptyComponent.props.children).toBe(empty);
});

it("keeps a caller header and footer alongside screen chrome, mounted once", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const callerHeader = createElement("span", null, "Search");
  const callerFooter = createElement("span", null, "Banner");
  act(() => root!.render(createElement(ScreenList, {
    data: [], renderItem: () => null, header: createElement("span", null, "Chrome"), footer: createElement("span", null, "Totals"),
    ListHeaderComponent: callerHeader, ListFooterComponent: callerFooter,
  })));
  const header = fixture.props.ListHeaderComponent;
  expect(header.props.children[1].props.children).toBe("Chrome");
  expect(header.props.children[2]).toBe(callerHeader);
  const footer = fixture.props.ListFooterComponent;
  expect(footer.props.children[1]).toBe(callerFooter);
});

it("passes a caller header through untouched when there is no screen chrome", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const callerHeader = createElement("span", null, "Search");
  act(() => root!.render(createElement(ScreenList, { data: [], renderItem: () => null, ListHeaderComponent: callerHeader })));
  expect(fixture.props.ListHeaderComponent).toBe(callerHeader);
});

it("forwards the tab identity opt-out to the shared heading", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(ScreenList, { data: [], renderItem: () => null, title: "Inbox", identity: "title" })));
  expect(heading.props).toMatchObject({ title: "Inbox", identity: "title" });
  expect(fixture.props).not.toHaveProperty("identity");
});
