// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ fetching: false, refresh: undefined as any, refetch: vi.fn(async () => ({})) }));
vi.mock("./usage-charts", () => ({ UsageKpis: () => null, ProviderShare: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({ isFetching: fixture.fetching, refetch: fixture.refetch }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ name: "Computer" }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("../management/shared/format", () => ({ stamp: () => "Timestamp" }));
vi.mock("@/ui/metric-row", () => ({ MetricRow: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { accent: "" }, uiStyles: {} }) }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("panelui-native/components/meter", () => ({ Meter: () => null }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Section: Group, Stack: Group, NavigationGroup: Group, Disclosure: Group, QueryState: () => null, ToggleField: () => null,
    Screen: ({ actions, refreshState, children }: any) => { fixture.refresh = refreshState; return createElement("main", null, actions, children); },
    IconButton: ({ label, onPress, busy, disabled }: any) => createElement("button", { onClick: onPress, disabled, "data-busy": String(!!busy), "aria-label": label }),
    Row: Group,
  };
});
import { DiagnosticsScreen } from "./diagnostics-screen";
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; fixture.fetching = false; fixture.refetch.mockReset().mockResolvedValue({}); vi.unstubAllGlobals(); });
it("keeps polling quiet and shares manual toolbar/pull refresh flight", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); root = createRoot(node);
  const render = () => act(() => root!.render(createElement(DiagnosticsScreen, { project: { id: "project", name: "Project" } as any })));
  fixture.fetching = true; await render(); expect(node.querySelector("button")!.dataset.busy).toBe("false"); expect(fixture.refresh.refreshing).toBe(false);
  fixture.fetching = false; await render(); let finish!: () => void;
  fixture.refetch.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({}); }));
  let pending!: Promise<void>; await act(() => { pending = fixture.refresh.onRefresh(); });
  await act(() => node.querySelector("button")!.click()); expect(fixture.refetch).toHaveBeenCalledOnce(); expect(fixture.refresh.refreshing).toBe(true);
  await act(async () => { finish(); await pending; }); expect(fixture.refresh.refreshing).toBe(false);
});
