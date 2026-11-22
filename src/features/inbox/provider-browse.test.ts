// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { createInboxBrowseMemory } from "./inbox-browse-memory";
import { RemoteHostError } from "@/remote/host-error";
import { InboxLocalScopeContext, useInboxLocalScope } from "./inbox-local-scope";
const fixture = vi.hoisted(() => ({
  memory:null as ReturnType<typeof createInboxBrowseMemory>|null, locale: "en",
  active: "fixture-machine", project: "fixture-project", localProject: null as string | null, readError: null as Error | null,
  reads: [] as boolean[], presses: new Map<string,()=>void>(), searchChange: null as null | ((value:string)=>void),
  available: true, success: true, fetching: false, partial: false, empty: false,
  omittedProjects: [] as { id: string; path: string }[],
  providersRetry: vi.fn(), itemsRetry: vi.fn(), availabilityRetry: vi.fn(),
  request: {} as { assignedToMe?: boolean; state?: string; search?: string },
  list: [] as RemoteInboxItem[],
  error: null as Error | null, route: vi.fn(),
}));
vi.mock("../workspace/pull-request-state-badge", () => ({ PullRequestStateBadge: ({ label }: { label: string }) => createElement("span", null, label) }));
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("./inbox-browse-memory-provider",()=>({useInboxBrowseMemory:()=>fixture.memory}));
vi.mock("expo-router", () => ({ router: { push: fixture.route } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/i18n", () => ({ useLocale: () => fixture.locale }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) => en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)) }));
vi.mock("../management/shared/record-bits", () => ({ useRelativeTime: () => () => "" }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ capabilities: [] }), useMachines:{getState:()=>({activeId:fixture.active,selectedProjectId:fixture.project})} }));
vi.mock("../management/common", () => ({ Scope: () => null }));
vi.mock("./jira-board-screen", () => ({ ProviderJiraBoards: () => null }));
vi.mock("./provider-queries", () => ({
  useProviderInboxAvailability: () => ({ data: { available: fixture.available }, isSuccess: fixture.success, error: fixture.error, refetch: fixture.availabilityRetry }),
  useInboxRead: ({ action, input }: any, enabled:boolean) => {
    fixture.reads.push(enabled);
    const base = { error:fixture.readError,isSuccess: !fixture.readError, isFetching: fixture.fetching, refetch: action === "providers" ? fixture.providersRetry : fixture.itemsRetry };
    if (action === "providers") return { ...base, data: [{ provider: "github", connected: true, error: fixture.partial ? "Account unavailable" : undefined }] };
    fixture.request = input.query;
    return { ...base, data: { items: fixture.empty ? [] : fixture.list, errors: fixture.partial ? { jira: "Jira unavailable", gitlab: "GitLab unavailable" } : {}, omittedProjects: fixture.omittedProjects } };
  },
}));
vi.mock("./provider-detail", async () => {
  const { useState } = await import("react");
  return { ProviderInboxDetail: ({ item, origin }: any) => { const [draft, setDraft] = useState(""); const scope = useInboxLocalScope();
    return createElement("label", { "data-detail-scope": scope.matches(origin) ? "current" : "stale" }, item.title,
    createElement("input", { "aria-label": "Draft reply", value: draft, onChange: (event: any) => setDraft(event.target.value) })); } };
});
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: ({ issues, onRetry, retrying }: any) => issues.filter(Boolean).length ? createElement("section", null,
  ...issues.filter(Boolean).map((issue: string) => createElement("p", { key: issue }, issue)),
  onRetry ? createElement("button", { onClick: onRetry, disabled: retrying }, "Retry") : null) : null }));
vi.mock("@/ui/search-field", () => ({
  SearchField: ({ value, onChangeText }: any) => {fixture.searchChange=onChangeText;return createElement("input", { "aria-label": "Search", value, onChange: (event: any) => onChangeText(event.target.value) });},
  SearchToolbar: ({ search, actions }: any) => createElement("div", null, search, actions),
}));
vi.mock("@/ui/filter-sheet", () => ({
  AppliedFilters: ({filters,result}:any) => createElement("p", {"data-applied-filters":true}, [result,...filters].filter(Boolean).join(" · ")),
  FilterButton: ({ onPress }: any) => createElement("button", { onClick: onPress }, "Filters"),
  FilterSheet: ({ children, onApply, onReset, onClose }: any) => {fixture.presses.set("Apply",onApply);fixture.presses.set("Reset",onReset);fixture.presses.set("Dismiss filters",onClose);return createElement("aside", {"data-filter":true}, children,
    createElement("button", { onClick: onApply }, "Apply"), createElement("button", { onClick: onReset }, "Reset"), createElement("button", { onClick: onClose }, "Dismiss filters"));},
}));
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ data, header, footer, renderItem, keyExtractor }: any) => createElement("main", { "data-row-count": data.length }, header,
  ...data.map((item: RemoteInboxItem) => createElement("div", { key: keyExtractor(item) }, renderItem({ item }))), footer) }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title, detail, action }: any) => createElement("div", null, title, detail, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  Notice: ({ message }: any) => createElement("p", null, message),
  ErrorNotice: ({ error, action }: any) => createElement("div", null, error.message, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress }: any) => {fixture.presses.set(label,onPress);return createElement("button", { onClick: onPress }, label);};
  return { Badge: ({ label }: any) => createElement("span", null, label), Body: Wrap, Row: Wrap, Stack: Wrap, Disclosure: Wrap,
    NavigationGroup: Wrap, Button, StateView: ({ title, description }: any) => createElement("p", null, title, description), NavigationRow: Button, Notice: ({ message }: any) => createElement("p", null, message),
    Empty: ({ title }: any) => createElement("p", null, title),
    ActionMenu: ({ actions }: any) => createElement("div", null, ...actions.filter(Boolean).map((action: any) => createElement(Button, { key: action.key, ...action }))),
    ToggleField: ({ label, value, onChange }: any) => createElement("button", { onClick: () => onChange(!value) }, label),
    Sheet: ({ children, title }: PropsWithChildren<{ title?: string }>) => createElement("aside", { "data-detail-sheet": true, "data-title": title },
      createElement(InboxLocalScopeContext, { value: null }, children)),
    QueryState,
  };
});
import { ProviderInboxBrowse } from "./provider-browse";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const origin = { machineId: "fixture-machine", projectId: "fixture-project" };
async function render() {
  const browse = createElement(ProviderInboxBrowse, { origin });
  const projectId = fixture.localProject;
  await act(async () => root.render(projectId ? createElement(InboxLocalScopeContext, { value: {
    projectId,
    setProjectId: () => {},
    matches: target => target.machineId === fixture.active && target.projectId === fixture.localProject,
  } }, browse) : browse));
}
function buttons(label: string) { return [...container.querySelectorAll("button")].filter((button) => button.textContent === label); }
async function click(label: string) { await act(async () => buttons(label)[0].click()); }
async function input(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  fixture.memory=null;fixture.locale="en";fixture.error = null; fixture.readError=null;fixture.active="fixture-machine";fixture.project="fixture-project";fixture.localProject=null;fixture.reads=[];fixture.presses.clear();fixture.searchChange=null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  fixture.available = true; fixture.success = true; fixture.fetching = false; fixture.partial = false; fixture.empty = false;
  fixture.omittedProjects = [];
  fixture.list = Array.from({ length: 85 }, (_, i) => ({ provider: "github", kind: "pr", number: i + 1, repo: "synthetic/repo", title: `Item ${i + 1}`,
    state: "OPEN", url: "https://synthetic.invalid", projectPath: "/synthetic", updatedAt: "", draft: false, labels: [], assignees: [] }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("rechecks the desktop connection without reading provider data while unavailable", async () => {
  fixture.available = false;
  await render();
  expect(container.textContent).toContain("Open Bycoda on your computer");
  await click("Retry");
  expect(fixture.availabilityRetry).toHaveBeenCalledOnce();
  expect(fixture.itemsRetry).not.toHaveBeenCalled();
  expect(fixture.providersRetry).not.toHaveBeenCalled();
});

it("discloses projects outside the remote Inbox limit while keeping available items visible", async () => {
  fixture.omittedProjects = [{ id: "other", path: "/other" }, { id: "another", path: "/another" }];
  await render();
  expect(container.textContent).toContain("2 projects are not shown in this list. Choose one in the scope to see its items.");
  expect(container.textContent).toContain("Item 1");
});

it("does not confirm an empty Inbox when some projects were omitted", async () => {
  fixture.empty = true;
  fixture.omittedProjects = [{ id: "other", path: "/other" }];
  await render();
  expect(container.textContent).toContain("not shown in this list");
  expect(container.textContent).not.toContain("No open items");
});

it("passes bounded batches to the virtualized owner and commits search only after debounce", async () => {
  await render(); expect(container.querySelector("main")!.dataset.rowCount).toBe("40");
  await click("Show more"); expect(container.querySelector("main")!.dataset.rowCount).toBe("80");
  await input("Search", " parser "); expect(fixture.request.search).toBe("");
  await act(async () => vi.advanceTimersByTime(350));
  expect(fixture.request.search).toBe("parser"); expect(container.querySelector("main")!.dataset.rowCount).toBe("40");
});
it.each([0, 1, 1284])("labels the %s returned records with an active-locale count", async (count) => {
  fixture.locale = "tr";
  fixture.list = Array.from({ length: count }, (_, index) => ({ ...fixture.list[0], number: index + 1, title: `Item ${index + 1}` }));
  await render();
  expect(container.querySelector("[data-applied-filters]")?.textContent).toContain(`Items: ${new Intl.NumberFormat("tr").format(count)}`);
});
it("clears an empty filter result without changing filters before Apply", async () => {
  fixture.empty = true; await render(); expect(fixture.request.assignedToMe).toBe(false);
  await click("Filters"); await click("Assigned to me only"); expect(fixture.request.assignedToMe).toBe(false);
  await click("Apply"); expect(fixture.request.assignedToMe).toBe(true);
  expect(buttons("Clear filters")).toHaveLength(1);
  await click("Clear filters");
  expect(fixture.request).toEqual({ assignedToMe: false, state: "open", search: "" });
  expect(buttons("Clear filters")).toHaveLength(0);
});
it("waits for the search before showing no results and offers a direct reset", async () => {
  fixture.empty = true;
  await render();
  await input("Search", "no match");
  expect(container.textContent).not.toContain("No matching results");
  await act(async () => vi.advanceTimersByTime(350));
  expect(container.textContent).toContain("No matching results");
  expect(buttons("Clear filters")).toHaveLength(0);
  await click("Clear search");
  expect(fixture.request.search).toBe("");
  expect(container.textContent).toContain("No open items");
});

it("keeps the chosen filters when clearing an unsuccessful text search", async () => {
  fixture.empty = true;
  await render();
  await click("Filters");
  await click("Assigned to me only");
  await click("Apply");
  await input("Search", "missing item");
  await act(async () => vi.advanceTimersByTime(350));
  await click("Clear search");
  expect(fixture.request).toEqual({ assignedToMe: true, state: "open", search: "" });
  expect(container.textContent).toContain("No items match these filters");
});
it("retains independent partial failures and routes each retry to its source without claiming an empty success", async () => {
  fixture.empty = true; fixture.partial = true; await render();
  expect(container.textContent).not.toContain("No items match these filters");
  for (const message of ["Jira unavailable", "GitLab unavailable"]) expect(container.textContent).toContain(message);
  await click("Connected services");
  expect(container.textContent).toContain("Account unavailable");
  await act(async () => container.querySelector<HTMLButtonElement>('aside[data-title="Connected services"] button')!.click()); expect(fixture.providersRetry).toHaveBeenCalledOnce();
  await act(async () => container.querySelector<HTMLButtonElement>("main section button")!.click()); expect(fixture.itemsRetry).toHaveBeenCalledOnce();
  fixture.success = false; await render();
  expect(container.querySelector("main")!.textContent).not.toContain("Jira unavailable");
  expect(container.querySelector('aside[data-title="Connected services"]')!.textContent).not.toContain("Account unavailable");
  await click("Refresh"); expect(fixture.availabilityRetry).toHaveBeenCalledOnce(); expect(fixture.itemsRetry).toHaveBeenCalledOnce();
  fixture.available = false; fixture.success = true; await render();
  const services = container.querySelector('aside[data-title="Connected services"]')!;
  expect(services.textContent).toContain("Open Bycoda on your computer");
  expect(services.textContent).not.toContain("Account unavailable");
});
it("shows no warning banner for cached-unavailable refresh failures and no stale desktop-setup explanation", async () => {
  await render(); await click("Connected services");
  fixture.available = false; fixture.success = false; fixture.error = new Error("Availability refresh failed"); await render();
  const services = container.querySelector('aside[data-title="Connected services"]')!;
  expect(container.textContent).not.toContain("Could not refresh");
  expect(services.textContent).not.toContain("Open Bycoda on your computer");
  expect(container.querySelector("main")!.textContent).not.toContain("Open Bycoda on your computer");
  fixture.success = true; fixture.error = null; await render();
  expect(services.textContent).toContain("Open Bycoda on your computer");
});
it("dismisses the read-only services sheet before navigating to auth repair", async () => {
  await render(); await click("Connected services");
  fixture.available = false; fixture.success = false; fixture.error = new RemoteHostError(origin.machineId, "auth", "Pairing needs repair"); await render();
  const services = container.querySelector('aside[data-title="Connected services"]')!;
  const repair = [...services.querySelectorAll("button")].find((button) => button.textContent === "Manage connections")!;
  await act(async () => repair.click());
  expect(container.querySelector('aside[data-title="Connected services"]')).toBeNull();
  expect(fixture.route).toHaveBeenCalledExactlyOnceWith("/machines");
  expect(fixture.itemsRetry).not.toHaveBeenCalled(); expect(fixture.providersRetry).not.toHaveBeenCalled();
});
it("keeps a selected detail and its draft outside the virtualized header when availability changes", async () => {
  await render(); await click("Item 1"); await input("Draft reply", "Keep my reply");
  fixture.available = false; fixture.success = false; await render();
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Draft reply"]')!.value).toBe("Keep my reply");
  expect(container.querySelector("main")!.dataset.rowCount).toBe("0");
  expect(container.querySelector("main aside[data-detail-sheet]")).toBeNull();
  expect(container.querySelector("aside[data-detail-sheet]")?.getAttribute("data-title")).toBe("Details");
});

it("preserves the Inbox-local project when provider detail moves into the overlay", async () => {
  fixture.project = "workspace-project";
  fixture.localProject = origin.projectId;
  await render();
  await click("Item 1");
  expect(container.querySelector("[data-detail-scope]")?.getAttribute("data-detail-scope")).toBe("current");
});

it("describes committed filters without previewing cancelled draft choices",async()=>{
 await render();const summary=()=>container.querySelector("[data-applied-filters]")!.textContent;
 expect(summary()).not.toContain("Assigned to me only");
 await click("Filters");await click("Include closed items");
 expect(summary()).not.toContain("Include closed items");
 await click("Dismiss filters");expect(summary()).not.toContain("Include closed items");
 await click("Filters");await click("Include closed items");await click("Apply");
 expect(summary()).toContain("Include closed items");expect(fixture.request.state).toBe("all");
});

it("clears applied filters and search directly while matching records remain visible",async()=>{
 await render();await click("Filters");await click("Include closed items");await click("Apply");
 await input("Search","parser");await act(async()=>vi.advanceTimersByTime(350));
 expect(fixture.request).toMatchObject({state:"all",search:"parser"});
 expect(container.querySelector("main")!.dataset.rowCount).toBe("40");
 await click("Clear filters");
 expect(fixture.request).toMatchObject({state:"open",assignedToMe:false,search:""});
 expect((container.querySelector('input[aria-label="Search"]') as HTMLInputElement).value).toBe("");
 expect(container.querySelector("[data-applied-filters]")?.textContent).not.toContain("Include closed items");
});

it.each(["availability","not-ready","machine","project","auth","identity"])("conceals cached rows/search/providers and retires staged filters across %s loss",async kind=>{
 await render();await input("Search","private search");await act(async()=>vi.advanceTimersByTime(350));await click("Show more");
 const search=fixture.searchChange!,row=fixture.presses.get("Item 1")!;await click("Filters");await click("Include closed items");const apply=fixture.presses.get("Apply")!,reset=fixture.presses.get("Reset")!,close=fixture.presses.get("Dismiss filters")!;
 if(kind==="availability")fixture.available=false;if(kind==="not-ready")fixture.success=false;if(kind==="machine")fixture.active="other";if(kind==="project")fixture.project="other";
 if(kind==="auth"||kind==="identity")fixture.readError=new RemoteHostError(origin.machineId,kind,"Private read unavailable");await render();
 expect(container.querySelector("main")!.dataset.rowCount).toBe("0");expect(container.querySelector('input[aria-label="Search"]')).toBeNull();expect(container.querySelector('[data-filter]')).toBeNull();expect(container.textContent).not.toContain("Item 1");expect(fixture.reads.at(-1)).toBe(kind==="auth"||kind==="identity");
 await act(async()=>{search("Must not replace search");row();apply();reset();close();});expect(container.querySelector('aside[data-title="Details"]')).toBeNull();
 fixture.available=true;fixture.success=true;fixture.active=origin.machineId;fixture.project=origin.projectId;fixture.readError=null;await render();
 await act(async()=>{search("Stale restored search");row();apply();});expect((container.querySelector('input[aria-label="Search"]') as HTMLInputElement).value).toBe("private search");expect(container.querySelector("main")!.dataset.rowCount).toBe("80");expect(container.querySelector('aside[data-title="Details"]')).toBeNull();expect(container.querySelector('[data-filter]')).toBeNull();expect(fixture.request.state).toBe("open");
});
it("keeps only repair feedback in an open services sheet while provider reads are private, then restores diagnostics",async()=>{
 fixture.partial=true;await render();await click("Connected services");expect(container.querySelector('aside[data-title="Connected services"]')!.textContent).toContain("Account unavailable");
 fixture.readError=new RemoteHostError(origin.machineId,"auth","Reconnect this computer");await render();const services=container.querySelector('aside[data-title="Connected services"]')!;
 expect(services.textContent).not.toContain("Account unavailable");expect(services.textContent?.match(/Reconnect this computer/g)).toHaveLength(1);
 fixture.readError=null;await render();expect(container.querySelector('aside[data-title="Connected services"]')!.textContent).toContain("Account unavailable");
});
it("pauses a pending search while a selected detail owns a reply draft",async()=>{
 await render();await input("Search","pending search");await click("Item 1");await input("Draft reply","Keep this selected draft");await act(async()=>vi.advanceTimersByTime(1000));
 expect(container.querySelector('input[aria-label="Draft reply"]')).not.toBeNull();expect(fixture.request.search).toBe("");expect((container.querySelector('input[aria-label="Draft reply"]') as HTMLInputElement).value).toBe("Keep this selected draft");
});
it("rejects Apply/Reset/Close from a dismissed filter after opening a new draft",async()=>{
 await render();await click("Filters");const apply=fixture.presses.get("Apply")!,reset=fixture.presses.get("Reset")!,close=fixture.presses.get("Dismiss filters")!;await click("Dismiss filters");await click("Filters");await click("Include closed items");await act(async()=>{apply();reset();close();});expect(container.querySelector('[data-filter]')).not.toBeNull();await click("Apply");expect(fixture.request.state).toBe("all");
});

it("rejects retained reads/open callbacks from a retired memory scope even if IDs still match",async()=>{
 fixture.memory=createInboxBrowseMemory(origin);await render();const open=fixture.presses.get("Item 1")!,refresh=fixture.presses.get("Refresh")!;fixture.memory.retire();await act(async()=>{open();refresh();});
 expect(container.querySelector('aside[data-title="Details"]')).toBeNull();expect(fixture.itemsRetry).not.toHaveBeenCalled();expect(fixture.availabilityRetry).not.toHaveBeenCalled();
});
