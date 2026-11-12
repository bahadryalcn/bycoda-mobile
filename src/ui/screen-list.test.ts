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
vi.mock("./layout", () => ({ useScreenHeading: () => null, useScreenChrome: () => ({ bottomSafeArea: false }) }));
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
