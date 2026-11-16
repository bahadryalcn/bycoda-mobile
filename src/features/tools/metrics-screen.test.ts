// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
const fixture = vi.hoisted(() => ({
  supported: true, fetching: false, hasData: true, error: null as Error | null,
  samples: [] as unknown[], params: {} as Record<string, unknown>, interval: undefined as number | undefined,
  enabled: undefined as boolean | undefined, refetch: vi.fn(), nativeOptions: [] as Record<string, unknown>[],
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => ({ refetchQueries: fixture.refetch }),
  useIsFetching: () => 0,
}));
vi.mock("./usage-charts", () => ({ UsageKpis: () => null, ProviderShare: () => null }));
vi.mock("@/ui/usage-meters", () => ({ RemainingMeter: () => null, AccountMeter: () => null, CostKpi: () => null, DailyBars: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: ({ options }: { options: Record<string, unknown> }) => { fixture.nativeOptions.push(options); return null; } }, useLocalSearchParams: () => ({}) }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: "computer", endpoint: "https://synthetic.invalid", name: "Computer", environmentId: "env", capabilities: fixture.supported ? ["usage.sessions.read"] : [] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: "computer", machines: [machine()] }) } };
});
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {}, fontSize: {}, radii: {} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-round", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/briefcase", () => ({ default: () => null }));
vi.mock("panelui-native/components/meter", () => ({ Meter: () => null }));
vi.mock("../management/shared/format", () => ({ stamp: () => "Sample time" }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("panelui-native/components/badge", () => ({ Badge: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/metric-row", () => ({ MetricRow: ({ label, value }: any) => createElement("p", null, `${label}: ${value}`) }));
vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, preview, details }: any) => createElement("article", null, title, preview, details) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, params: Record<string, unknown>, options: any) => {
  fixture.params = params; fixture.interval = options?.interval; fixture.enabled = options?.enabled;
  const data = method === "resources.read" ? { samples: fixture.samples } : {
    rows: [{ sessionId: "session", provider: "codex", ...values }], totals: values, sampledAt: Date.now(), coverage: { truncated: false, undatedTurns: 0 }, nextCursor: "page-two",
  };
  return { data: fixture.hasData ? data : undefined, isSuccess: fixture.hasData && !fixture.error, isFetching: fixture.fetching,
    isPending: !fixture.hasData, fetchStatus: fixture.fetching ? "fetching" : "idle", error: fixture.error, refetch: fixture.refetch };
} }));
vi.mock("@/ui/primitives", async () => {
  const { getQueryPresentation } = await import("@/ui/query-presentation");
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  const IconButton = ({ label, onPress, disabled, busy }: any) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  return { Body: Wrap, Disclosure: Wrap, NavigationGroup: Wrap, Section: Wrap, Stack: Wrap, Button, IconButton, Row: Wrap,
    ActionMenu: ({ actions }: { actions: { key: string; label: string; onPress: () => void }[] }) => createElement("nav", null, actions.map(action => createElement(Button, { key: action.key, label: action.label, onPress: action.onPress }))),
    ToggleField: ({ label, value, onChange }: any) => createElement("button", { onClick: () => onChange(!value) }, label),
    Screen: ({ children, actions }: any) => createElement("main", null, actions, children),
    ScreenList: ({ header, footer, actions, data, renderItem }: any) => createElement("main", null, actions, header, ...data.map((item: unknown, i: number) => createElement("div", { key: i }, renderItem({ item }))), footer),
    SegmentedControl: ({ value, onChange, disabled, label, options }: any) => options.length === 2 ? createElement("button", { disabled, "aria-label": label, onClick: () => onChange(value === "1" ? "7" : "1") }, "Change range") : null, Card: ({ children }: any) => children, SectionHeader: () => null,
    SelectField: ({ value, onChange, disabled }: any) => createElement("button", { disabled, onClick: () => onChange(value === "1" ? "7" : "1") }, "Change range"),
    StateView: ({ title, description }: any) => createElement("p", null, title, description), Notice: ({ message }: any) => createElement("p", null, message),
    QueryState: ({ query, empty, emptyTitle }: any) => { const state = getQueryPresentation(query, empty); return state === "empty" ? createElement("p", null, emptyTitle) : state === "stale-error" ? createElement("p", null, "Showing cached data") : state === "loading" ? createElement("p", null, "Loading") : null; },
  };
});
import { DiagnosticsScreen, DiagnosticsDetails } from "./diagnostics-screen";
import { UsageScreen, UsageValues } from "./usage-screen";
import type { ResourceSample } from "./diagnostics-model";
const values = { turns: 4, timedTurns: 3, durationMs: null, inputTokens: null, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: null, cost: null };
const project = { id: "project", name: "Project", cwd: "/synthetic" };
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
  fixture.supported = true; fixture.fetching = false; fixture.hasData = true; fixture.error = null; fixture.samples = []; fixture.nativeOptions.length = 0;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("owns exactly one visible usage refresh action and preserves UTC window, range and cursor semantics", async () => {
  await render(createElement(UsageScreen, { project }));
  expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Refresh")).toHaveLength(1);
  expect(fixture.nativeOptions.every((options) => options.headerRight === undefined)).toBe(true);
  expect(fixture.params).toMatchObject({ projectId: "project", limit: 50, untilMs: Date.now(), sinceMs: Date.now() - 86400000 });
  await click("Next page"); expect(fixture.params.cursor).toBe("page-two");
  await click("Change range"); expect(fixture.params.cursor).toBeUndefined(); expect(fixture.params.sinceMs).toBe(Date.now() - 7 * 86400000);
  vi.setSystemTime(Date.now() + 1000); await click("Refresh");
  expect(fixture.params.untilMs).toBe(Date.now()); expect(fixture.params.cursor).toBeUndefined();
});
it("keeps unsupported usage empty and refresh disabled without enabling host reads", async () => {
  fixture.supported = false; await render(createElement(UsageScreen, { project }));
  expect(fixture.enabled).toBe(false); expect(container.querySelector("article")).toBeNull();
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Refresh")!.disabled).toBe(true);
});
it("distinguishes successful empty diagnostics from loading and cached failure, while retaining explicit polling", async () => {
  await render(createElement(DiagnosticsScreen, { project })); expect(container.textContent).toContain("No samples yet.");
  expect(fixture.nativeOptions.some((options) => options.title === "Diagnostics")).toBe(true);
  expect(fixture.interval).toBeUndefined(); await click("Auto refresh"); expect(fixture.interval).toBe(10000);
  await click("Refresh"); expect(fixture.refetch).toHaveBeenCalledOnce();
  fixture.error = new Error("Disconnected"); await render(createElement(DiagnosticsScreen, { project }));
  expect(container.textContent).not.toContain("No samples yet."); expect(container.textContent).toContain("Showing cached data");
  fixture.error = null; fixture.hasData = false; fixture.fetching = true; await render(createElement(DiagnosticsScreen, { project }));
  expect(container.textContent).not.toContain("No samples yet."); expect(container.textContent).toContain("Loading");
});
it("keeps missing readings distinct from zero and reveals only fixed diagnostic fields", async () => {
  await render(createElement(UsageValues, { value: values }));
  expect(container.textContent).toContain("Input tokens: —"); expect(container.textContent).toContain("Cache read tokens: 0"); expect(container.textContent).toContain("Cost: —");
  const sample: ResourceSample = { at: Date.now(), host: { totalMemoryBytes: 1024, freeMemoryBytes: 0, logicalCpus: 8, loadAverage: null },
    process: { pid: 9, rssBytes: 1024, heapUsedBytes: 512, externalBytes: 1024 * 1024, cpuPercent: null, uptimeSeconds: 120 } };
  await render(createElement(DiagnosticsDetails, { sample }));
  expect(container.textContent).toContain("Process CPU: —"); expect(container.textContent).toContain("External memory: 1.0 MB"); expect(container.textContent).toContain("Load average (1 / 5 / 15 min): —");
});
