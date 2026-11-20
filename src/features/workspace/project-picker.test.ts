// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  rows: [] as { id: string; name: string; cwd: string }[], ready: true, readiness: "ready", privacy: false, error: null as Error | null,
  activeId: "machine", allowed: true, visible: true, epoch: 0, locale: "en", events: [] as string[], refetch: vi.fn(), select: vi.fn(),
  actions: new Map<string, () => void>(), search: undefined as undefined | ((value: string) => void),
  machine: { id: "machine", name: "Computer", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic" },
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("expo-router", () => ({ router: { push: () => fixture.events.push("route") } }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: "disconnected" }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/i18n", () => ({ useLocale: () => fixture.locale }));
vi.mock("@/ui/use-list-scroll-memory", () => ({ useFilteredListScrollMemory: () => ({ listProps: {} }) }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/state/connection-scope", () => { const epochs = new Map<number, any>(); return { useConnectionScope: () => {
  const epoch = fixture.epoch; if (!epochs.has(epoch)) epochs.set(epoch, { token: String(epoch), isCurrent: () => fixture.epoch === epoch }); return epochs.get(epoch);
} }; });
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("./shared", () => ({ GroupedListRow: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => fixture.machine, useMachines: { getState: () => ({ activeId: fixture.activeId, machines: [fixture.machine] }) } }));
vi.mock("@/state/project-directory-preferences", () => ({ useProjectDirectoryPreferences: () => ({ preferences: { sort: "name", recent: {}, fullPaths: false } }) }));
vi.mock("./use-project-directory", () => ({ useProjectList: () => ({ data: fixture.rows, directoryReady: fixture.ready, readiness: fixture.readiness,
  privacyUnavailable: fixture.privacy, error: fixture.error, isSuccess: true, refetch: fixture.refetch, isProjectVisible: (id: string, cwd?: string) => fixture.allowed && fixture.rows.some((row) => row.id === id && (cwd === undefined || row.cwd === cwd)) }) }));
vi.mock("@/ui/primitives", () => {
  const Button = ({ label, onPress }: any) => { fixture.actions.set(label, onPress); return createElement("button", { onClick: onPress }, label); };
  return { Body: ({ children }: PropsWithChildren) => createElement("span", null, children), Sheet: ({ children, footer, onClose }: any) => { fixture.actions.set("Close", onClose); return createElement("section", null, children, footer); },
    FormActions: ({ submitLabel, onSubmit }: any) => createElement(Button, { label: submitLabel, onPress: onSubmit }),
    ScreenList: ({ header, data, renderItem, ListEmptyComponent }: any) => createElement("main", null, createElement("header", null, header),
      createElement("section", null, !data.length ? ListEmptyComponent : null, ...data.map((item: unknown, index: number) => createElement("div", { key: index }, renderItem({ item, index }))))),
    NavigationRow: Button,
    SearchField: ({ label, value, onChangeText }: any) => { fixture.search = onChangeText; return createElement("input", { "aria-label": label, value, onChange: (event: any) => onChangeText(event.target.value) }); },
    Notice: ({ message, action, onRetry, retryLabel }: any) => createElement("div", null, message, action ? createElement(Button, { label: action.label, onPress: action.onPress }) : null, onRetry ? createElement(Button, { label: retryLabel, onPress: onRetry }) : null),
    StateView: ({ title, description, action }: any) => createElement("div", null, title, description, action ? createElement(Button, { label: action.label, onPress: action.onPress }) : null),
    QueryState: ({ query, empty, emptyTitle, emptyAction, onManageConnections }: any) => query.error
      ? createElement("div", null, query.error.message, createElement(Button, { label: "Manage connections", onPress: onManageConnections }))
      : empty ? createElement("div", null, emptyTitle, emptyAction ? createElement(Button, { label: emptyAction.label, onPress: emptyAction.onPress }) : null) : null,
  };
});
import { ProjectPicker } from "./project-picker";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
async function render() { await act(async () => root.render(createElement(ProjectPicker, { visible: fixture.visible, onClose: () => fixture.events.push("close"), onSelect: fixture.select }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.rows = [{ id: "beta", name: "Beta", cwd: "/synthetic/beta" }, { id: "alpha", name: "Alpha", cwd: "/synthetic/alpha" }];
  fixture.ready = true; fixture.readiness = "ready"; fixture.privacy = false; fixture.error = null; fixture.activeId = "machine"; fixture.allowed = true; fixture.visible = true; fixture.epoch = 0; fixture.locale = "en"; fixture.events.length = 0; fixture.actions.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("sorts and searches projects, with explicit clear recovery and the exact selected object", async () => {
  await render(); expect([...container.querySelectorAll("main button")].map((button) => button.textContent)).toEqual(["Alpha", "Beta"]);
  expect(container.textContent).toContain("Computer");
  const input = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "missing"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("No projects match your search."); await click("Clear search"); expect(input.value).toBe("");
  await click("Alpha"); expect(fixture.select).toHaveBeenCalledWith(fixture.rows[1]);
});
it("distinguishes an actually empty directory from no search matches", async () => {
  fixture.rows = []; await render(); expect(container.textContent).toContain("No projects on this computer yet."); expect(container.textContent).not.toContain("No projects match your search.");
});
it("uses one waiting explanation and closes the picker before connection navigation", async () => {
  fixture.ready = false; fixture.readiness = "waiting"; await render();
  expect(container.textContent?.match(/Waiting for a connection/g)).toHaveLength(1);
  await click("Manage connections"); expect(fixture.events).toEqual(["close", "route"]);
});
it("keeps privacy synchronization local and gives exact errors precedence", async () => {
  fixture.rows = []; fixture.ready = false; fixture.readiness = "waiting"; fixture.privacy = true; await render();
  expect(container.textContent).toContain("Protected groups stay hidden"); expect(container.textContent).not.toContain("Waiting for a connection");
  await click("Refresh"); expect(fixture.refetch).toHaveBeenCalledOnce();
  fixture.error = new Error("Pairing needs repair"); await render(); expect(container.textContent).not.toContain("Protected groups stay hidden");
  await click("Manage connections"); expect(fixture.events).toEqual(["close", "route"]);
});
it("refuses selection after visibility or current-machine authority changes", async () => {
  await render(); fixture.allowed = false; await click("Alpha"); expect(fixture.select).not.toHaveBeenCalled();
  fixture.allowed = true; fixture.activeId = "other"; await click("Alpha"); expect(fixture.select).not.toHaveBeenCalled();
});
it("retires row events across close and reopening", async () => {
  await render(); const old = fixture.actions.get("Alpha")!; fixture.visible = false; await render();
  await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled(); fixture.visible = true; await render();
  await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled(); await click("Alpha"); expect(fixture.select).toHaveBeenCalledOnce();
});
it("rejects an old row when the query hides it", async () => {
  await render(); const old = fixture.actions.get("Alpha")!; await act(async () => fixture.search!("Beta"));
  await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled();
});
it("requires the current exact project folder before React commits", async () => {
  await render(); const old = fixture.actions.get("Alpha")!; fixture.rows = fixture.rows.map(row => row.id === "alpha" ? { ...row, cwd: "/changed" } : row);
  await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled();
});
it("retires an original connection epoch even when its computer ID survives", async () => {
  await render(); const old = fixture.actions.get("Alpha")!; fixture.epoch++;
  await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled();
});
it("retires row events across directory loss and recovery", async () => {
  await render(); const old = fixture.actions.get("Alpha")!; fixture.ready = false; fixture.readiness = "waiting"; await render();
  fixture.ready = true; fixture.readiness = "ready"; await render(); await act(async () => old()); expect(fixture.select).not.toHaveBeenCalled();
});
it("keeps search outside the scrolling list and accepts batched locale-aware typing", async () => {
  fixture.locale = "tr"; fixture.rows = [{ id: "turkish", name: "İLETİŞİM", cwd: "/synthetic/turkish" }]; await render();
  const input = container.querySelector("input"), change = fixture.search!; await act(async () => { change("ile"); change("iletişim"); });
  expect(container.querySelector("input")).toBe(input); expect(container.textContent).toContain("İLETİŞİM"); expect(container.querySelector("main input")).toBeNull();
});
it("retires queued selection immediately and never emits it twice", async () => {
  await render(); const choose = fixture.actions.get("Alpha")!; await act(async () => { choose(); choose(); }); expect(fixture.select).toHaveBeenCalledOnce();
});
it("keeps query state through temporary directory loss and retires its old input", async () => {
  await render(); await act(async () => fixture.search!("Alpha")); const old = fixture.search!;
  fixture.ready = false; fixture.readiness = "waiting"; await render(); expect(container.querySelector("input")!.value).toBe("");
  fixture.ready = true; fixture.readiness = "ready"; await render(); await act(async () => old("retired")); expect(container.querySelector("input")!.value).toBe("Alpha");
});
it("does not let an old clear wipe a newer query", async () => {
  await render(); await act(async () => fixture.search!("missing")); const clear = fixture.actions.get("Clear search")!;
  await act(async () => fixture.search!("Beta")); await act(async () => clear()); expect(container.querySelector("input")!.value).toBe("Beta");
});
it("retires repair actions when the error disappears or the picker closes", async () => {
  fixture.rows = []; fixture.error = new Error("repair"); await render(); const repair = fixture.actions.get("Manage connections")!;
  fixture.error = null; await render(); await act(async () => repair()); expect(fixture.events).toEqual([]);
  fixture.error = new Error("repair"); await render(); const next = fixture.actions.get("Manage connections")!;
  await act(async () => fixture.actions.get("Close")!()); await act(async () => next()); expect(fixture.events).toEqual(["close"]);
});
it("coalesces explicit refresh and retires its callback after close", async () => {
  fixture.ready = false; fixture.privacy = true; fixture.readiness = "sync-required";
  let resolve!: () => void; fixture.refetch.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  await render(); const refresh = fixture.actions.get("Refresh")!; await act(async () => { refresh(); refresh(); }); expect(fixture.refetch).toHaveBeenCalledOnce();
  await act(async () => fixture.actions.get("Close")!()); await act(async () => { resolve(); refresh(); }); expect(fixture.refetch).toHaveBeenCalledOnce();
});
