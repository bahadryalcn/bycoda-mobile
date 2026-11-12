// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  machineId: "computer", endpoint: "https://synthetic.invalid", environmentId: "environment", lanKey: "synthetic", projectId: "project", supported: true,
  fetching: false, error: false, emptyPage: false, emptyAll: false, params: {} as any, reads: [] as any[], refresh: undefined as any, oldNext: undefined as any,
  refetch: vi.fn(async () => ({})),
}));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/usage-meters", () => ({ RemainingMeter: () => null, AccountMeter: () => null, CostKpi: () => null, DailyBars: () => null }));
vi.mock("./usage-charts", () => ({ UsageKpis: ({ items }: any) => createElement("div", null, items.map((item: any) => createElement("span", { key: item.title }, item.title, item.value))), ProviderShare: () => null }));
vi.mock("@/ui/tokens", () => ({ space: {}, fontSize: {}, radii: {} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: fixture.machineId, name: "Computer", endpoint: fixture.endpoint, environmentId: fixture.environmentId, lanKey: fixture.lanKey, capabilities: fixture.supported ? ["usage.sessions.read"] : [] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: fixture.machineId, machines: [machine()] }) } };
});
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, _method: string, params: any) => {
  fixture.params = params; fixture.reads.push({ ...params, machineId: fixture.machineId, endpoint: fixture.endpoint });
  const empty = fixture.emptyAll || fixture.emptyPage && params.cursor;
  const totals = { turns: empty ? 0 : 1, timedTurns: empty ? 0 : 1, durationMs: empty ? null : 1000, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null };
  return { data: { totals, sampledAt: 1, coverage: {}, rows: fixture.emptyAll || fixture.emptyPage && params.cursor ? [] : [{ ...totals, sessionId: "session", provider: "Provider" }], nextCursor: params.cursor ? null : "page-2" },
    isFetching: fixture.fetching, isError: fixture.error, error: fixture.error ? new Error("Synthetic refresh error") : null, isSuccess: !fixture.error, refetch: fixture.refetch };
} }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  ErrorNotice: () => null, Notice: ({ message }: any) => createElement("span", null, message), Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/metric-row", () => ({ MetricRow: ({ label, value }: any) => createElement("div", null, label, value) }));
vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, preview }: any) => createElement("div", null, title, preview) }));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { QueryState, Body: Group, Disclosure: Group, StateView: ({ title, description }: any) => createElement("p", null, title, description), Notice: ({ message }: any) => createElement("div", null, message),
    IconButton: ({ label, onPress, disabled, busy }: any) => createElement("button", { disabled: disabled || busy, onClick: onPress, "data-busy": String(!!busy) }, label),
    Button: ({ label, onPress, disabled, busy }: any) => { if (label === "Next page") fixture.oldNext = onPress; return createElement("button", { disabled: disabled || busy, onClick: onPress, "data-busy": String(!!busy) }, label); },
    SegmentedControl: ({ value, onChange, options }: any) => createElement("div", null, options.map((o: any) => createElement("button", { key: o.value, "aria-pressed": value === o.value, onClick: () => onChange(o.value) }, o.label))),
    Card: Group, SectionHeader: ({ title }: any) => createElement("h3", null, title),
    SelectField: ({ label, value, onChange, disabled }: any) => createElement("select", { "aria-label": label, disabled, value, onChange: (e: any) => onChange(e.target.value) }, ["1", "7"].map(v => createElement("option", { key: v, value: v }, v))),
    ScreenList: ({ header, actions, data, renderItem, footer, refreshState }: any) => { fixture.refresh = refreshState; return createElement("main", null, actions, header, data.map((item: any) => createElement("section", { key: item.sessionId }, renderItem({ item }))), footer); },
  };
});
import { UsageScreen } from "./usage-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(() => root.render(createElement(UsageScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const button = (label: string) => [...node.querySelectorAll("button")].find(b => b.textContent === label)!;
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(() => button(label).click()); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(1793560000000);
  fixture.machineId = "computer"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "environment"; fixture.lanKey = "synthetic"; fixture.projectId = "project";
  fixture.supported = true; fixture.fetching = false; fixture.error = false; fixture.emptyPage = false; fixture.emptyAll = false; fixture.reads = [];
  fixture.refetch.mockReset().mockResolvedValue({}); node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["machine", "endpoint", "project", "environment", "key"])("drops the previous page before the first %s scope read and rejects a stale action", async kind => {
  await render(); const stale = fixture.oldNext; await click("Next page"); expect(fixture.params.cursor).toBe("page-2"); fixture.reads = [];
  if (kind === "machine") fixture.machineId = "other";
  if (kind === "endpoint") fixture.endpoint = "https://repaired.synthetic.invalid";
  if (kind === "project") fixture.projectId = "other";
  if (kind === "environment") fixture.environmentId = "other";
  if (kind === "key") fixture.lanKey = "other-synthetic";
  await render(); expect(fixture.reads.every(read => read.cursor === undefined)).toBe(true);
  await act(() => stale()); expect(fixture.params.cursor).toBeUndefined();
  fixture.machineId = "computer"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "environment"; fixture.lanKey = "synthetic"; fixture.projectId = "project";
  await render(); expect(fixture.params.cursor).toBeUndefined();
});
it("offers first-page recovery once for an empty later page", async () => {
  fixture.emptyPage = true; await render(); await click("Next page");
  expect(node.textContent).toContain("No observed turns on this page."); expect([...node.querySelectorAll("button")].filter(b => b.textContent === "First page")).toHaveLength(1);
  expect(node.textContent).not.toContain("Observed totals on this page");
  await click("First page"); expect(fixture.params.cursor).toBeUndefined(); expect(node.textContent).toContain("Provider");
});
it("keeps an error separate from empty success, blocks stale next-page navigation and permits first-page recovery", async () => {
  await render(); fixture.error = true; await render(); expect(button("Next page").disabled).toBe(true);
  expect(node.textContent).not.toContain("No observed turns on this page.");
  fixture.error = false; await render(); await click("Next page"); fixture.error = true; fixture.emptyAll = true; await render();
  await click("First page"); expect(fixture.params.cursor).toBeUndefined();
});
it("coalesces same-millisecond toolbar/pull refresh and releases it on failure without losing recovery", async () => {
  let reject!: (e: Error) => void; fixture.refetch.mockImplementationOnce(() => new Promise((_r, fail) => { reject = fail; }));
  await render(); await act(() => fixture.refresh.onRefresh()); await click("Refresh");
  expect(fixture.refetch).toHaveBeenCalledOnce(); expect(fixture.refresh.refreshing).toBe(true);
  await act(async () => reject(new Error("Synthetic read failure"))); expect(fixture.refresh.refreshing).toBe(false);
  await click("Refresh"); expect(fixture.refetch).toHaveBeenCalledTimes(2);
});
it("resets page and advances the window for refresh, while range changes keep the reviewed window end", async () => {
  await render(); const end = fixture.params.untilMs; await click("Next page");
  const field = node.querySelector("select")!; await act(() => { field.value = "7"; field.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(fixture.params.cursor).toBeUndefined(); expect(fixture.params.untilMs).toBe(end); expect(end - fixture.params.sinceMs).toBe(7 * 86400000);
  vi.mocked(Date.now).mockReturnValue(end + 1000); await act(() => fixture.refresh.onRefresh()); expect(fixture.params.untilMs).toBe(end + 1000); expect(fixture.params.cursor).toBeUndefined();
});
it("does not offer refresh/paging or an editable range when unsupported", async () => {
  fixture.supported = false; await render(); expect(fixture.refresh).toBeUndefined(); expect(button("Refresh").disabled).toBe(true); expect(node.querySelector("select")!.disabled).toBe(true); expect(button("Next page")).toBeUndefined();
});
it("does not let an old refresh completion clear the current scope's refresh indicator", async () => {
  let first!: () => void, second!: () => void;
  fixture.refetch.mockImplementationOnce(() => new Promise(resolve => { first = () => resolve({}); })).mockImplementationOnce(() => new Promise(resolve => { second = () => resolve({}); }));
  await render(); await act(() => fixture.refresh.onRefresh()); fixture.projectId = "other-project"; await render();
  await act(() => fixture.refresh.onRefresh()); expect(fixture.refresh.refreshing).toBe(true);
  await act(async () => first()); expect(fixture.refresh.refreshing).toBe(true);
  await act(async () => second()); expect(fixture.refresh.refreshing).toBe(false);
});
it("shows token breakdown by default and a Host-update state for Cost and Limits without session rows", async () => {
  await render();
  expect(node.textContent).toContain("Total tokens"); expect(node.textContent).toContain("By provider");
  await click("Cost"); expect(node.textContent).toContain("Cost is not available on mobile yet");
  expect(node.textContent).not.toContain("Provider"); expect(node.textContent).not.toContain("Next page");
  await click("Limits"); expect(node.textContent).toContain("Limits are not available on mobile yet");
  await click("Tokens"); expect(node.textContent).toContain("Next page");
});
