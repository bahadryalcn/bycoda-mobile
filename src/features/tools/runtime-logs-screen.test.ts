// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/ui/message-code", () => ({ MessageCode: ({ code }: { code: string }) => createElement("pre", null, code) }));
const fixture = vi.hoisted(() => ({
  entries: [] as any[], sources: [] as any[], sourceError: null as Error | null, hideHeader: false,
  projectId: "project", endpoint: "https://synthetic.invalid", params: {} as any,
  logsRead: vi.fn(), sourcesRead: vi.fn(), refresh: undefined as any, rowRenders: 0,
}));
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() } }));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../management/shared/format", () => ({ stamp: () => "Timestamp" }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-video", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer", name: "Computer", endpoint: fixture.endpoint }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, params: any) => {
  if (method === "runtimeLogs.read") fixture.params = params;
  return { data: method === "runtimeLogs.read" ? { entries: fixture.entries } : fixture.sources,
    error: method === "runtimeLogs.sources" ? fixture.sourceError : null, isSuccess: true,
    refetch: method === "runtimeLogs.read" ? fixture.logsRead : fixture.sourcesRead };
} }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  ErrorNotice: () => null, Notice: ({ message }: any) => createElement("span", null, message), Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: ({ issues, onRetry }: any) => issues.length ? createElement("div", null, issues.join(";"), createElement("button", { onClick: onRetry }, "Retry sources")) : null }));
vi.mock("@/ui/filter-sheet", () => ({
  AppliedFilters: ({filters,result}:any) => createElement("p", {"data-applied-filters":true}, [result,...filters].filter(Boolean).join(" · ")),
  FilterButton: ({ onPress }: any) => createElement("button", { onClick: onPress }, "Filters"),
  FilterSheet: ({ children, onApply, onClose }: any) => createElement("aside", null, children, createElement("button", { onClick: onApply }, "Apply"), createElement("button", { onClick: onClose }, "Dismiss filters")),
}));
function MonitorPanel() {
  const [draft, setDraft] = useState("");
  return createElement("input", { "aria-label": "Monitor draft", value: draft, onChange: (e: any) => setDraft(e.target.value) });
}
vi.mock("./runtime-monitors", () => ({ RuntimeMonitors: MonitorPanel }));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, onPress, disabled }: any) => createElement("button", { disabled, onClick: onPress }, label);
  return { QueryState, Body: Group, Row: Group, CodePanel: Group, CodeText: Group, NavigationGroup: Group,
    ActionMenu: ({actions}:any) => createElement("div",null,actions.map((action:any)=>createElement("button",{key:action.key,onClick:action.onPress},action.label))),
    Badge: () => null, StatusText: () => null, Notice: () => null, Empty: () => null, ErrorText: () => null,
    IconButton: button, NavigationRow: (props: any) => { fixture.rowRenders++; return button(props); },
    Sheet: ({ visible, children }: any) => visible ? createElement("aside", { "data-log-detail": true }, children) : null,
    SearchToolbar: ({ search, actions }: any) => createElement("div", null, search, actions),
    SearchField: ({ label, value, onChangeText, ref }: any) => createElement("input", { ref, "aria-label": label, value, onChange: (e: any) => onChangeText(e.target.value) }),
    SelectField: ({ label, value, options, onChange }: any) => createElement("select", { "aria-label": label, value, onChange: (e: any) => onChange(e.target.value) }, options.map((o: any) => createElement("option", { key: o.value, value: o.value }, o.label))),
    ToggleField: ({ label, value, onChange }: any) => createElement("button", { "aria-pressed": value, onClick: () => onChange(!value) }, label),
    ScreenList: ({ header, actions, data, renderItem, refreshState, ListEmptyComponent }: any) => { fixture.refresh = refreshState; return createElement("main", null, actions,
      fixture.hideHeader ? null : createElement("header", null, header), data.length ? null : ListEmptyComponent, data.map((item: any) => createElement("div", { key: item.id }, renderItem({ item })))); },
  };
});
import { RuntimeLogsScreen } from "./runtime-logs-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(() => root.render(createElement(RuntimeLogsScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const click = async (label: string) => { const b = [...node.querySelectorAll("button")].find(e => e.textContent === label); expect(b).toBeTruthy(); await act(() => b!.click()); };
const input = async (label: string, value: string) => { const e = node.querySelector(`input[aria-label="${label}"]`)!; await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, value); e.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.clearAllMocks(); fixture.rowRenders = 0; fixture.entries = []; fixture.sources = []; fixture.sourceError = null; fixture.hideHeader = false; fixture.projectId = "project"; fixture.endpoint = "https://synthetic.invalid";
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); vi.useRealTimers(); });
it("keeps auto refresh in log settings and independent of applying filters", async () => {
  await render();
  await click("Filters");
  expect(node.textContent).not.toContain("Auto refresh");
  await click("Apply");
  await click("Settings");
  await click("Auto refresh");
  expect(node.querySelector('button[aria-pressed="false"]')?.textContent).toBe("Auto refresh");
});
it("shares toolbar/pull refresh flight and refreshes logs plus source availability", async () => {
  let finish!: () => void; fixture.logsRead.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(); let pending!: Promise<unknown>;
  await act(() => { pending = fixture.refresh.onRefresh(); }); await click("Refresh");
  expect(fixture.logsRead).toHaveBeenCalledOnce(); expect(fixture.sourcesRead).toHaveBeenCalledOnce(); expect(fixture.refresh.refreshing).toBe(true);
  await act(async () => { finish(); await pending; }); expect(fixture.refresh.refreshing).toBe(false);
});
it("does not claim an empty success while a source is unavailable or failed", async () => {
  fixture.sources = [{ id: "source", projectId: "project", label: "Browser", available: false, reason: "Offline" }]; await render();
  expect(node.textContent).not.toContain("No logs yet"); expect(node.textContent).toContain("Browser");
  await click("Retry sources"); expect(fixture.sourcesRead).toHaveBeenCalledOnce(); expect(fixture.logsRead).not.toHaveBeenCalled();
  fixture.sources = []; fixture.sourceError = new Error("Source read failed"); await render(); expect(node.textContent).not.toContain("No logs yet");
  fixture.sourceError = null; await render(); expect(node.textContent).toContain("No logs yet");
});
it("distinguishes filtered emptiness, resets filters, and never applies a dismissed draft", async () => {
  await render(); await click("Filters");
  const level = node.querySelector('select[aria-label="Level"]')!;
  await act(() => { (level as HTMLSelectElement).value = "error"; level.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(node.querySelector("[data-applied-filters]")!.textContent).not.toContain("Level: Error");
  await click("Dismiss filters"); expect(fixture.params.levels).toBeUndefined();
  await click("Filters"); const fresh = node.querySelector('select[aria-label="Level"]')!;
  await act(() => { (fresh as HTMLSelectElement).value = "error"; fresh.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("Apply"); expect(node.querySelector("[data-applied-filters]")!.textContent).toContain("Level: Error"); expect(fixture.params.levels).toEqual(["error"]); expect(node.textContent).toContain("No matching results");
  await click("Clear filters"); expect(fixture.params.levels).toBeUndefined(); expect(node.textContent).toContain("No logs yet");
  expect(document.activeElement).toBe(node.querySelector('input[aria-label="Search logs"]'));
});

it("names search-only recovery, restores focus and cancels a newer pending query when clearing", async () => {
  vi.useFakeTimers(); await render(); await input("Search logs", "no-match");
  await act(() => vi.advanceTimersByTime(300));
  expect(fixture.params.search).toBe("no-match");
  expect(node.textContent).toContain("Clear search");
  expect(node.textContent).not.toContain("Clear filters");
  await input("Search logs", "newer pending query");
  await click("Clear search");
  const field = node.querySelector('input[aria-label="Search logs"]') as HTMLInputElement;
  expect(field.value).toBe(""); expect(document.activeElement).toBe(field);
  expect(fixture.params.search).toBeUndefined();
  await act(() => vi.advanceTimersByTime(400));
  expect(fixture.params.search).toBeUndefined();
  expect(node.textContent).toContain("No logs yet");
});
it("keeps the monitor draft and log detail outside the disappearing list header", async () => {
  fixture.entries = [{ id: "log", projectId: "project", message: "Entry", timestamp: 1, level: "info" }];
  await render(); await click("Log monitors"); await input("Monitor draft", "4000"); await click("Entry");
  fixture.hideHeader = true; await render(); expect((node.querySelector('input[aria-label="Monitor draft"]') as HTMLInputElement).value).toBe("4000"); expect(node.querySelector("[data-log-detail]")).not.toBeNull();
  fixture.endpoint = "https://repaired.synthetic.invalid"; await render(); expect(node.querySelector("[data-log-detail]")).toBeNull();
  fixture.endpoint = "https://synthetic.invalid"; await render(); expect(node.querySelector("[data-log-detail]")).toBeNull();
});
it("re-renders only new log rows on keystrokes and polls, keeping the search draft and filters", async () => {
  const log = (id: string) => ({ id, projectId: "project", message: id, timestamp: 1, level: "info", sourceId: "source", source: "server" });
  const [a, b] = [log("a"), log("b")]; fixture.entries = [a, b];
  await render(); expect(fixture.rowRenders).toBe(2);
  await input("Search logs", "e"); await input("Search logs", "er");
  expect((node.querySelector('input[aria-label="Search logs"]') as HTMLInputElement).value).toBe("er");
  expect(fixture.rowRenders).toBe(2);
  fixture.entries = [a, b]; await render(); expect(fixture.rowRenders).toBe(2);
  fixture.entries = [a, b, log("c")]; await render(); expect(fixture.rowRenders).toBe(3);
  expect([...node.querySelectorAll("main > div button")].map(row => row.textContent).filter(text => ["a", "b", "c"].includes(text!))).toEqual(["c", "b", "a"]);
});
it("re-renders only new log rows on keystrokes and polls, keeping the search draft and filters", async () => {
  const log = (id: string) => ({ id, projectId: "project", message: id, timestamp: 1, level: "info", sourceId: "source", source: "server" });
  const [a, b] = [log("a"), log("b")]; fixture.entries = [a, b];
  const rows = () => [...node.querySelectorAll("main > div > button")].map(row => row.textContent).filter(text => ["a", "b", "c"].includes(text!));
  await render(); expect(fixture.rowRenders).toBe(2);
  await input("Search logs", "e"); await input("Search logs", "er");
  expect((node.querySelector('input[aria-label="Search logs"]') as HTMLInputElement).value).toBe("er");
  expect(fixture.rowRenders).toBe(2);
  fixture.entries = [a, b]; await render(); expect(fixture.rowRenders).toBe(2);
  fixture.entries = [a, b, log("c")]; await render(); expect(fixture.rowRenders).toBe(3);
  expect(rows()).toEqual(["c", "b", "a"]);
});
it("debounces search and suppresses log reads for an oversized draft during manual refresh", async () => {
  vi.useFakeTimers(); await render(); await input("Search logs", "  query  "); expect(fixture.params.search).toBeUndefined();
  await act(() => vi.advanceTimersByTime(300)); expect(fixture.params.search).toBe("query");
  await input("Search logs", "x".repeat(513)); await act(async () => fixture.refresh.onRefresh());
  expect(fixture.logsRead).not.toHaveBeenCalled(); expect(fixture.sourcesRead).toHaveBeenCalledOnce();
});
