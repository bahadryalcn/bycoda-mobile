// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderJiraBoards } from "./jira-board-screen";
import { InboxLocalScopeContext } from "./inbox-local-scope";
import { recallInboxRecord, recallJiraSnapshot } from "./inbox-record-route";
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("../management/shared/record-bits", () => ({ useRelativeTime: () => () => "1 g" }));
vi.mock("react-native", () => ({ View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, semanticColors: { info: {}, success: {}, warning: {}, danger: {} }, uiStyles: {} }) }));
vi.mock("./provider-mark", () => ({ ProviderMark: () => null }));
vi.mock("@/ui/scope-pill", () => ({ ScopePill: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, `Board: ${label}`) }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevrons-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/equal", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-round", () => ({ default: () => null }));

type Request = { action: string; input?: { boardId?: number; scope?: string; sprintId?: number; pageToken?: string } };
const state = vi.hoisted(() => ({
  requests: [] as Request[], selected: null as null | { issue: unknown; snapshot: unknown },
  activeId: "machine", projectId: "project", fetching: false, error: null as unknown, reflect: true,
  selectors: new Map<string, (value: string) => void>(), rowPress: null as null | (() => void),
  refetch: vi.fn(), apply: null as null | (() => void), actions: new Map<string, () => void>(), singleBoard: false, localProjectId: null as string | null,
  boards: new Map<string, () => void>(),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", name: "Computer", capabilities: ["inbox.jiraBoard.v1"] }),
  useMachines: { getState: () => ({ activeId: state.activeId, selectedProjectId: state.projectId }) },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
  en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)) }));
const push = vi.hoisted(() => vi.fn());
vi.mock("expo-router", () => ({ router: { push } }));
vi.mock("./provider-queries", () => ({ useInboxRead: (request: Request, enabled: boolean) => {
  if (enabled) state.requests.push(request);
  if (request.action === "jira-board-read" && enabled && state.reflect) {
    snapshot.board.id = request.input!.boardId!;
    snapshot.scope = { scope: request.input!.scope!, sprintId: request.input!.sprintId ?? null, pageToken: request.input!.pageToken ?? null };
  }
  return { data: request.action === "jira-boards" ? (state.singleBoard ? [{ id: 1, name: "Fixture board" }] : [{ id: 1, name: "Fixture board" }, { id: 2, name: "Second board" }]) : snapshot,
    isSuccess: enabled, isFetching: state.fetching, error: request.action === "jira-board-read" ? state.error : null,
    refetch: () => state.refetch(request.action) };
} }));
vi.mock("@/ui/search-field", () => ({ CollectionToolbar: ({ field, actions }: { field: ReactNode; actions: ReactNode }) => createElement("div", null, field, actions) }));
vi.mock("@/ui/filter-sheet", () => ({
  FilterButton: ({ count, onPress }: { count: number; onPress: () => void }) => createElement("button", { "data-count": count, onClick: onPress }, "Filters"),
  AppliedFilters: ({ result, filters }: { result?: string; filters: Array<string | false | undefined> }) => createElement("p", null, [result, ...filters.filter(Boolean)].join(" · ")),
  FilterSheet: ({ children, onApply, onReset, onClose, applyDisabled }: { children: ReactNode; onApply: () => void; onReset: () => void; onClose: () => void; applyDisabled: boolean }) => {
    state.apply = onApply;
    return createElement("section", { "aria-label": "Filter editor" }, children,
      createElement("button", { onClick: onClose }, "Dismiss filters"), createElement("button", { onClick: onReset }, "Reset"),
      createElement("button", { onClick: onApply, disabled: applyDisabled }, "Apply"));
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress?: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Screen: Wrapper, Body: Wrapper, Badge: ({ label }: { label: string }) => createElement("span", null, label), StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    Sheet: ({ children, title }: { children: ReactNode; title: string }) => createElement("div", { role: "dialog", "aria-label": title },
      createElement(InboxLocalScopeContext, { value: null }, children)),
    Row: Wrapper, Stack: Wrapper, NavigationGroup: Wrapper, SectionHeader: ({ title, count }: { title: string; count?: number }) => createElement("h3", null, `${title} ${count ?? ""}`),
    IconButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => { state.actions.set("refresh", onPress); return createElement("button", { disabled, onClick: onPress }, label); },
    StateView: ({ title, description, action }: any) => createElement("p", null, title, description, action ? createElement(Button, action) : null), Notice: ({ message }: { message: string }) => createElement("span", null, message), QueryState: () => null, Button,
    ActionMenu: ({ actions }: { actions: Array<{ key: string; label: string; disabled?: boolean; onPress: () => void }> }) => createElement("div", null, actions.map((action) => {
      state.actions.set(action.key, action.onPress); return createElement(Button, { ...action, key: action.key });
    })),
    NavigationRow: ({ label, detail, accessibilityLabel, supporting, disabled, onPress, selected }: { label: string; detail?: string; accessibilityLabel?: string; supporting?: ReactNode; disabled?: boolean; onPress: () => void; selected?: boolean }) =>
      { if (selected !== undefined) state.boards.set(label, onPress); else state.rowPress = onPress; return createElement("button", { "aria-label": accessibilityLabel ?? [label, detail].filter(Boolean).join(". "), disabled, onClick: onPress }, label, detail, supporting); },
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) => { state.selectors.set(label, onChange); return createElement("select", { "aria-label": label, value, disabled, onChange: (event: { target: { value: string } }) => onChange(event.target.value) },
        createElement("option", { value: "" }, ""), options.filter((option) => option.value).map((option) => createElement("option", { key: option.value, value: option.value }, option.label))); },
    SegmentedControl: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) =>
      createElement("select", { "aria-label": label, value, disabled, onChange: (event: { target: { value: string } }) => onChange(event.target.value) },
        options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label))),
    ScreenList: ({ header, footer, data, renderItem }: { header: ReactNode; footer: ReactNode; data: unknown[]; renderItem: (row: { item: unknown }) => ReactNode }) =>
      createElement("main", null, createElement("header", null, header), data.map((item, index) => createElement("div", { key: index }, renderItem({ item }))), createElement("footer", null, footer)),
  };
});
let snapshot: {
  snapshotId: string; projectCwd: string; board: { id: number; name: string }; scope: { scope: string; sprintId?: number | null; pageToken?: string | null };
  configuration: { sprints: Array<{ id: number; name: string; state: "active" | "future"; goal: string }>; columns: Array<{ name: string; statusIds: string[] }> };
  page: { issues: Array<{ identifier: string; title: string; statusId: string; state: string }>; nextPageToken: string };
};
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>, props: ComponentProps<typeof ProviderJiraBoards>;
async function render() {
  const boards = createElement(ProviderJiraBoards, props);
  const localProjectId = state.localProjectId;
  await act(async () => root.render(localProjectId ? createElement(InboxLocalScopeContext, { value: {
    projectId: localProjectId,
    setProjectId: () => {},
    matches: origin => origin.machineId === state.activeId && origin.projectId === state.localProjectId,
  } }, boards) : boards));
}
async function mount(empty = false, canWrite = true, issueState = "To do") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.append(container);
  snapshot = { snapshotId: "snapshot", projectCwd: "/project", board: { id: 1, name: "Fixture board" }, scope: { scope: "board", pageToken: null },
    configuration: { sprints: [{ id: 7, name: "Active sprint", state: "active", goal: "Preserve scope" }], columns: [{ name: "Todo", statusIds: ["todo"] }, { name: "Done", statusIds: ["done"] }] },
    page: { issues: empty ? [] : [{ identifier: "ABC-1", title: "Fixture issue", statusId: "todo", state: issueState }], nextPageToken: "page2" } };
  props = { origin: { machineId: "machine", projectId: "project" }, canRead: true, canWrite };
  root = createRoot(container); await render(); if (!state.singleBoard) await select("Jira board", "1");
}
const boardNames: Record<string, string> = { "1": "Fixture board", "2": "Second board" };
async function select(label: string, value: string) {
  if (label === "Jira board") {
    await act(async () => [...container.querySelectorAll("button")].find((node) => node.textContent?.startsWith("Board: "))!.click());
    await act(async () => state.boards.get(boardNames[value]!)!());
    return;
  }
  await act(async () => {
  const node = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
}); }
function button(label: string) { return [...container.querySelectorAll("button")].find((node) => node.textContent === label)!; }
async function click(label: string) { await act(async () => button(label).click()); }
function latestRead() { return state.requests.filter((request) => request.action === "jira-board-read").at(-1)!.input!; }
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); state.requests = []; state.boards.clear(); state.selected = null; state.activeId = "machine"; state.projectId = "project";
  state.fetching = false; state.error = null; state.reflect = true; state.singleBoard = false; state.localProjectId = null; state.apply = null; state.actions.clear(); state.selectors.clear(); state.rowPress = null; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("explains a page-local empty column and clears only that filter", async () => {
  await mount(); await click("Filters"); await select("Column", "2"); await click("Apply");
  expect(container.textContent).toContain("Showing 0 of 1 loaded issues.");
  expect(container.textContent).toContain("No loaded issues are in the selected column."); expect(container.textContent).not.toContain("ABC-1");
  await click("Clear column filter"); expect(container.textContent).toContain("ABC-1"); expect(container.textContent).toContain("1 issues loaded");
  expect(container.textContent).toContain("Board: Fixture board");
  expect(container.querySelector("footer")!.textContent).toContain("Show more");
  expect(state.requests.every((request) => ["jira-boards", "jira-board-read"].includes(request.action))).toBe(true);
});
it("distinguishes an empty page without claiming the full board is empty", async () => {
  await mount(true); expect(container.textContent).toContain("0 issues loaded"); expect(container.textContent).toContain("No issues in this view.");
  expect(container.textContent).not.toContain("Clear column filter"); expect(container.querySelector("footer")!.textContent).toContain("Show more");
});

it("clears active board filters through the sheet's Reset and returns to the first page without changing the board",async()=>{
  await mount();await click("Filters");await select("Board scope","backlog");await click("Apply");
  await click("Show more");expect(latestRead().pageToken).toBe("page2");
  await click("Filters");await click("Reset");await click("Apply");
  expect(latestRead()).toMatchObject({boardId:1,scope:"board"});
  expect(latestRead().pageToken).toBeUndefined();
  expect(container.querySelector('[data-count]')?.getAttribute("data-count")).toBe("0");
});
it.each([true, false])("retains full custom state and opens the issue page with its original row and snapshot, canWrite=%s", async (canWrite) => {
  const custom = "Waiting for security, accessibility and owner approval before release"; await mount(false, canWrite, custom);
  const row = container.querySelector('button[aria-label^="Fixture issue"]') as HTMLButtonElement;
  expect(row.getAttribute("aria-label")).toBe(`Fixture issue. ABC-1. ${custom}`); expect(row.textContent).toContain(custom); expect(row.disabled).toBe(false);
  await act(async () => row.click());
  const issue = snapshot.page.issues[0] as never;
  expect(push).toHaveBeenCalledExactlyOnceWith({ pathname: "/inbox/record", params: expect.objectContaining({ identifier: "ABC-1", boardSnapshot: "snapshot", machineId: "machine", projectId: "project" }) });
  expect(recallJiraSnapshot("machine", "project", "snapshot")).toBe(snapshot);
  expect(recallInboxRecord("machine", "project", issue)).toBe(issue);
});
it("opens the issue page for the Inbox project, not the workspace's", async () => {
  state.projectId = "workspace-project";
  state.localProjectId = "project";
  await mount();
  const row = container.querySelector('button[aria-label^="Fixture issue"]') as HTMLButtonElement;
  await act(async () => row.click());
  expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ projectId: "project" }) }));
});

it("loads issues automatically when there is one Jira board", async () => {
  state.singleBoard = true; await mount();
  expect(latestRead()).toMatchObject({ projectId: "project", boardId: 1, scope: "board" });
  expect(container.textContent).toContain("ABC-1");
});
it("stages and cancels scope/column changes without changing the active read key", async () => {
  await mount(); expect(container.querySelector('select[aria-label="Board scope"]')).toBeNull();
  await click("Filters"); await select("Board scope", "backlog"); await select("Column", "2");
  expect(latestRead().scope).toBe("board"); expect(container.textContent).toContain("ABC-1"); await click("Dismiss filters");
  expect(latestRead().scope).toBe("board"); expect(container.querySelector('[data-count]')?.getAttribute("data-count")).toBe("0");
  await click("Filters"); expect((container.querySelector('select[aria-label="Board scope"]') as HTMLSelectElement).value).toBe("board");
});
it("requires a sprint and preserves its choices while applying the exact scope", async () => {
  await mount(); await click("Filters"); await select("Board scope", "sprint"); expect(button("Apply").disabled).toBe(true);
  state.apply!(); expect(latestRead().scope).toBe("board"); await select("Sprint", "7"); await click("Apply");
  expect(latestRead()).toMatchObject({ projectId: "project", boardId: 1, scope: "sprint", sprintId: 7 });
  expect(container.textContent).toContain("Active sprint");
  await click("Filters"); await select("Board scope", "backlog"); await click("Apply");
  await click("Filters"); await select("Board scope", "sprint"); expect((container.querySelector('select[aria-label="Sprint"]') as HTMLSelectElement).value).toBe("7");
});
it("adds the next page below the loaded rows and starts again only for a changed read scope", async () => {
  await mount(); await click("Show more"); expect(latestRead().pageToken).toBe("page2");
  expect(container.textContent).toContain("ABC-1");
  await click("Filters"); await select("Column", "2"); await click("Apply"); expect(latestRead().pageToken).toBe("page2");
  await click("Clear column filter"); expect(latestRead().pageToken).toBe("page2");
  await click("Filters"); await select("Board scope", "backlog"); await click("Apply");
  expect(latestRead().scope).toBe("backlog"); expect(latestRead().pageToken).toBeUndefined(); expect(button("Previous page")).toBeUndefined();
});
it("keeps Reset staged until Apply and returns to the default board scope", async () => {
  await mount(); await click("Filters"); await select("Board scope", "sprint"); await select("Sprint", "7"); await click("Apply");
  await click("Filters"); await click("Reset"); expect(latestRead().scope).toBe("sprint"); await click("Apply");
  expect(latestRead().scope).toBe("board"); expect(latestRead().sprintId).toBeUndefined();
});
it.each(["read", "origin", "auth", "identity"])("masks cached records and retires staged Apply after %s loss", async (reason) => {
  await mount(); const press = state.rowPress!; await click("Board: Fixture board"); const choose = state.boards.get("Second board")!;
  await click("Filters"); await select("Board scope", "backlog"); const apply = state.apply!, refresh = state.actions.get("refresh")!;
  if (reason === "read") props = { ...props, canRead: false };
  if (reason === "origin") state.activeId = "other";
  if (reason === "auth" || reason === "identity") state.error = Object.assign(new Error("Private workspace"), { kind: reason });
  await render(); expect(container.textContent).not.toContain("Fixture issue"); expect(container.textContent).not.toContain("Fixture board");
  expect(container.querySelector('[aria-label="Filter editor"]')).toBeNull(); apply(); choose(); press();
  expect(latestRead().scope).toBe("board");
  if (reason === "read" || reason === "origin") { refresh(); expect(state.refetch).not.toHaveBeenCalled(); }
  props = { ...props, canRead: true }; state.activeId = "machine"; state.error = null; await render();
  expect(latestRead()).toMatchObject({ boardId: 1, scope: "board" }); expect(push).not.toHaveBeenCalled();
});
it("ignores a staged Apply from another board and retires callbacks on unmount", async () => {
  await mount(); await click("Filters"); await select("Board scope", "backlog"); const apply = state.apply!, refresh = state.actions.get("refresh")!;
  await select("Jira board", "2"); apply(); expect(latestRead()).toMatchObject({ boardId: 2, scope: "board" });
  await act(async () => root.render(null)); refresh(); expect(state.refetch).not.toHaveBeenCalled();
});
it("keeps the loaded rows when the next page does not match and says to refresh", async () => {
  await mount(); state.reflect = false; await click("Show more");
  expect(container.textContent).toContain("ABC-1");
  expect(container.textContent).toContain("The board view changed. Refresh to continue.");
});
it("refreshes a multi-page view from its first page and a single page in place", async () => {
  await mount(); state.actions.get("refresh")!();
  expect(state.refetch).toHaveBeenCalledWith("jira-boards"); expect(state.refetch).toHaveBeenCalledWith("jira-board-read");
  state.refetch.mockClear(); await click("Show more"); expect(latestRead().pageToken).toBe("page2");
  await act(async () => { state.actions.get("refresh")!(); });
  expect(latestRead().pageToken).toBeUndefined(); expect(state.refetch).toHaveBeenCalledWith("jira-boards");
  expect(container.textContent).toContain("ABC-1");
});
it("groups the page by board column with counts and keeps one loading state", async () => {
  await mount();
  snapshot.page.issues = [{ identifier: "ABC-2", title: "Done issue", statusId: "done", state: "Done" }, { identifier: "ABC-1", title: "Fixture issue", statusId: "todo", state: "To do" }];
  await render();
  const headings = [...container.querySelectorAll("h3")].map((node) => node.textContent);
  expect(headings).toEqual(["Todo 1", "Done 1"]);
  expect(container.textContent!.indexOf("ABC-1")).toBeLessThan(container.textContent!.indexOf("ABC-2"));
});
