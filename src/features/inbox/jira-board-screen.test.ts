// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderJiraBoards } from "./jira-board-screen";
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));

type Request = { action: string; input?: { boardId?: number; scope?: string; sprintId?: number; pageToken?: string } };
const state = vi.hoisted(() => ({
  requests: [] as Request[], selected: null as null | { issue: unknown; snapshot: unknown },
  activeId: "machine", projectId: "project", fetching: false, error: null as unknown, reflect: true,
  selectors: new Map<string, (value: string) => void>(), rowPress: null as null | (() => void),
  refetch: vi.fn(), apply: null as null | (() => void), actions: new Map<string, () => void>(), singleBoard: false,
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", name: "Computer", capabilities: ["inbox.jiraBoard.v1"] }),
  useMachines: { getState: () => ({ activeId: state.activeId, selectedProjectId: state.projectId }) },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
  en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)) }));
vi.mock("./jira-board-issue", () => ({ JiraBoardIssueActions: ({ issue, snapshot }: { issue: unknown; snapshot: unknown }) => {
  state.selected = { issue, snapshot }; return createElement("output", null, "Selected issue");
} }));
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
  return { Body: Wrapper, Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Sheet: ({ children, title }: { children: ReactNode; title: string }) => createElement("div", { role: "dialog", "aria-label": title }, children),
    Row: Wrapper, Stack: Wrapper, StateView: ({ title, description }: any) => createElement("p", null, title, description), Notice: ({ message }: { message: string }) => createElement("span", null, message), QueryState: () => null, Button,
    ActionMenu: ({ actions }: { actions: Array<{ key: string; label: string; disabled?: boolean; onPress: () => void }> }) => createElement("div", null, actions.map((action) => {
      state.actions.set(action.key, action.onPress); return createElement(Button, { ...action, key: action.key });
    })),
    NavigationRow: ({ label, detail, accessibilityLabel, supporting, disabled, onPress }: { label: string; detail?: string; accessibilityLabel?: string; supporting?: ReactNode; disabled?: boolean; onPress: () => void }) =>
      { state.rowPress = onPress; return createElement("button", { "aria-label": accessibilityLabel ?? [label, detail].filter(Boolean).join(". "), disabled, onClick: onPress }, label, detail, supporting); },
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) => { state.selectors.set(label, onChange); return createElement("select", { "aria-label": label, value, disabled, onChange: (event: { target: { value: string } }) => onChange(event.target.value) },
        createElement("option", { value: "" }, ""), options.filter((option) => option.value).map((option) => createElement("option", { key: option.value, value: option.value }, option.label))); },
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
async function render() { await act(async () => root.render(createElement(ProviderJiraBoards, props))); }
async function mount(empty = false, canWrite = true, issueState = "To do") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.append(container);
  snapshot = { snapshotId: "snapshot", projectCwd: "/project", board: { id: 1, name: "Fixture board" }, scope: { scope: "board", pageToken: null },
    configuration: { sprints: [{ id: 7, name: "Active sprint", state: "active", goal: "Preserve scope" }], columns: [{ name: "Todo", statusIds: ["todo"] }, { name: "Done", statusIds: ["done"] }] },
    page: { issues: empty ? [] : [{ identifier: "ABC-1", title: "Fixture issue", statusId: "todo", state: issueState }], nextPageToken: "page2" } };
  props = { origin: { machineId: "machine", projectId: "project" }, canRead: true, canWrite, onClose: vi.fn() };
  root = createRoot(container); await render(); if (!state.singleBoard) await select("Jira board", "1");
}
async function select(label: string, value: string) { await act(async () => {
  const node = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
}); }
function button(label: string) { return [...container.querySelectorAll("button")].find((node) => node.textContent === label)!; }
async function click(label: string) { await act(async () => button(label).click()); }
function latestRead() { return state.requests.filter((request) => request.action === "jira-board-read").at(-1)!.input!; }
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); state.requests = []; state.selected = null; state.activeId = "machine"; state.projectId = "project";
  state.fetching = false; state.error = null; state.reflect = true; state.singleBoard = false; state.apply = null; state.actions.clear(); state.selectors.clear(); state.rowPress = null; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("explains a page-local empty column and clears only that filter", async () => {
  await mount(); await click("Filters"); await select("Column", "2"); await click("Apply");
  expect(container.textContent).toContain("Showing 0 of 1 issues on this page.");
  expect(container.textContent).toContain("No issues on this page match the selected column."); expect(container.textContent).not.toContain("ABC-1");
  await click("Clear column filter"); expect(container.textContent).toContain("ABC-1"); expect(container.textContent).toContain("Issues on this page: 1");
  expect((container.querySelector('select[aria-label="Jira board"]') as HTMLSelectElement).value).toBe("1");
  expect(container.querySelector("footer")!.textContent).toContain("Next page");
  expect(state.requests.every((request) => ["jira-boards", "jira-board-read"].includes(request.action))).toBe(true);
});
it("distinguishes an empty page without claiming the full board is empty", async () => {
  await mount(true); expect(container.textContent).toContain("Issues on this page: 0"); expect(container.textContent).toContain("No issues on this page.");
  expect(container.textContent).not.toContain("Clear column filter"); expect(container.querySelector("footer")!.textContent).toContain("Next page");
});

it("clears active board filters directly and returns to the first page without changing the board",async()=>{
  await mount();await click("Filters");await select("Board scope","backlog");await click("Apply");
  await click("Next page");expect(latestRead().pageToken).toBe("page2");
  await click("Clear filters");
  expect(latestRead()).toMatchObject({boardId:1,scope:"board"});
  expect(latestRead().pageToken).toBeUndefined();
  expect(container.querySelector('[data-count]')?.getAttribute("data-count")).toBe("0");
});
it.each([true, false])("retains full custom state, original issue/snapshot and canWrite=%s", async (canWrite) => {
  const custom = "Waiting for security, accessibility and owner approval before release"; await mount(false, canWrite, custom);
  const row = container.querySelector('button[aria-label^="Fixture issue"]') as HTMLButtonElement;
  expect(row.getAttribute("aria-label")).toBe(`Fixture issue. ABC-1. ${custom}`); expect(row.textContent).toContain(custom); expect(row.disabled).toBe(false);
  await act(async () => row.click());
  expect(state.selected?.issue).toBe(snapshot.page.issues[0]); expect(state.selected?.snapshot).toBe(snapshot);
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
it("keeps page-local columns on the current page and resets pages only for a changed read scope", async () => {
  await mount(); await click("Next page"); expect(latestRead().pageToken).toBe("page2");
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
  await mount(); await click("Filters"); await select("Board scope", "backlog"); const apply = state.apply!, refresh = state.actions.get("refresh")!, choose = state.selectors.get("Jira board")!, press = state.rowPress!;
  if (reason === "read") props = { ...props, canRead: false };
  if (reason === "origin") state.activeId = "other";
  if (reason === "auth" || reason === "identity") state.error = Object.assign(new Error("Private workspace"), { kind: reason });
  await render(); expect(container.textContent).not.toContain("Fixture issue"); expect(container.textContent).not.toContain("Fixture board");
  expect(container.querySelector('[aria-label="Filter editor"]')).toBeNull(); apply(); choose("2"); press();
  expect(latestRead().scope).toBe("board");
  if (reason === "read" || reason === "origin") { refresh(); expect(state.refetch).not.toHaveBeenCalled(); }
  props = { ...props, canRead: true }; state.activeId = "machine"; state.error = null; await render();
  expect(latestRead()).toMatchObject({ boardId: 1, scope: "board" }); expect(container.querySelector("output")).toBeNull();
});
it("ignores a staged Apply from another board and retires callbacks on unmount", async () => {
  await mount(); await click("Filters"); await select("Board scope", "backlog"); const apply = state.apply!, refresh = state.actions.get("refresh")!;
  await select("Jira board", "2"); apply(); expect(latestRead()).toMatchObject({ boardId: 2, scope: "board" });
  await act(async () => root.render(null)); refresh(); expect(state.refetch).not.toHaveBeenCalled();
});
it("masks a mismatched page and retains Previous page as a recovery action", async () => {
  await mount(); state.reflect = false; await click("Next page"); expect(container.textContent).not.toContain("ABC-1");
  expect(container.textContent).toContain("The board view changed. Refresh to continue."); await click("Previous page");
  expect(latestRead().pageToken).toBeUndefined(); expect(container.textContent).toContain("ABC-1");
});
it("keeps page recovery available after a failed read and preserves ordinary cached refresh", async () => {
  await mount(); state.reflect = false; state.error = new Error("Page offline"); await click("Next page"); await click("Previous page");
  expect(container.textContent).toContain("ABC-1"); state.actions.get("refresh")!();
  expect(state.refetch).toHaveBeenCalledWith("jira-boards"); expect(state.refetch).toHaveBeenCalledWith("jira-board-read");
});
