// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PrivateContentAccessProvider } from "./private-access";
import type { MessageContext } from "./media-policy";
import { ScopedFilePreview } from "./document-file-preview";

const s = vi.hoisted(() => {
  const value = { machine: { id: "machine", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic" }, active: true, allowed: true, epoch: 0, kind: "success", locale: "en", text: "Original source", entries: [{ name: "a.txt", path: "/project/a.txt", isDir: false }], requests: [] as any[], waiting: [] as ((value: string) => void)[], actions: new Map<string, () => void>(), openChild: undefined as undefined | ((path: string, context: MessageContext) => void), childContext: undefined as undefined | MessageContext, search: undefined as undefined | ((value: string) => void) };
  const request = async (method: string, params: unknown) => { value.requests.push({ method, params }); if (value.kind === "hold") return new Promise<string>(resolve => value.waiting.push(resolve)); if (value.kind !== "success") throw Object.assign(new Error(value.kind), { kind: value.kind }); return method === "files.list" ? value.entries : value.text; };
  return Object.assign(value, { client: { machine: value.machine, request } });
});
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: any) => h("div", null, ListHeaderComponent, data.length ? data.map((item: any) => h("div", { key: item.path }, renderItem({ item }))) : ListEmptyComponent) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./tokens", () => ({ colors: {}, space: {} }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => s.locale }));
vi.mock("./layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("./use-list-scroll-memory", () => ({ useFilteredListScrollMemory: () => ({ listProps: {} }) }));
vi.mock("./media-loader", () => ({ loadProjectMedia: vi.fn(async () => ({ uri: "file:///synthetic/image.png", name: "image.png", mimeType: "image/png" })) }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: s.machine.id, machines: [s.machine] }) } }));
vi.mock("@/state/connection-scope", () => { const epochs = new Map<number, any>(); return { useConnectionScope: () => { const epoch = s.epoch; if (!epochs.has(epoch)) epochs.set(epoch, { isCurrent: () => s.epoch === epoch }); return epochs.get(epoch); } }; });
vi.mock("@/state/queries", async () => { const { usePrivateContentAccess } = await import("./private-access"), { useMemo } = await import("react"); return { useHostReadActive: () => s.active, useHostClient: () => { const access = usePrivateContentAccess(); return useMemo(() => access.allowed && access.check() ? { ...s.client, request: async (method: string, params: any) => { if (!access.check()) throw Error("retired"); return s.client.request(method, params); } } : null, [access]); } }; });
vi.mock("./document-content", () => ({ ProjectMediaContent: () => null, DocumentContent: ({ text, context, onOpenFile }: any) => { s.openChild = onOpenFile; s.childContext = context; return h("div", { "data-source": true }, text); } }));
vi.mock("./primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => h("div", null, children), Button = ({ label, onPress, busy, disabled }: any) => { s.actions.set(label, onPress); return h("button", { onClick: onPress, disabled: busy || disabled }, label); };
  return { Body: Wrapper, CodePanel: ({ children }: PropsWithChildren) => h("div", { "data-snippet": true }, children), CodeText: Wrapper, Disclosure: Wrapper, Loading: () => null, Notice: ({ message }: any) => h("p", null, message), ErrorText: ({ error }: any) => error ? h("p", null, error.message) : null, Button,
    Empty: ({ title, action }: any) => h("div", null, title, action ? h(Button, { label: action.label, onPress: action.onPress }) : null),
    NoResults: ({ title, searching, filtered, onClearSearch, onClearFilters }: any) => h("div", null, title ?? "No matching results", searching && onClearSearch ? h(Button, { label: "Clear search", onPress: onClearSearch }) : filtered && onClearFilters ? h(Button, { label: "Clear filters", onPress: onClearFilters }) : null),
    NavigationRow: Button, SearchField: ({ value, onChangeText }: any) => { s.search = onChangeText; return h("input", { value, onChange: (e: any) => onChangeText(e.target.value) }); },
    ScreenList: ({ data, renderItem, header, ListEmptyComponent }: any) => h("div", null, header, data.length ? data.map((item: any) => h("div", { key: item.path }, renderItem({ item }))) : ListEmptyComponent),
    FormActions: ({ submitLabel, onSubmit, cancelLabel, onCancel, busy, feedback }: any) => h("div", { "data-actions": true }, h(Button, { label: submitLabel, onPress: onSubmit, busy }), onCancel ? h(Button, { label: cancelLabel, onPress: onCancel }) : null, feedback),
    Sheet: ({ children, title, onClose, footer }: any) => { s.actions.set("Close", onClose); return h("section", { "data-title": title }, children, footer); },
  };
});
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement, cache: QueryClient, shown = true, path = "a.txt";
const context = { client: s.client, machineId: "machine", projectId: "project", sessionId: "session", cwd: "/project" } as unknown as MessageContext;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
function element() { return h(QueryClientProvider, { client: cache }, h(PrivateContentAccessProvider, { value: { allowed: s.allowed, check: () => s.allowed } }, shown ? h(ScopedFilePreview, { path, context, onClose: () => { shown = false; root!.render(element()); } }) : null)); }
async function render(nextPath = path) { path = nextPath; if (!root) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); container = document.createElement("div"); root = createRoot(container); } await act(async () => root!.render(element())); await flush(); }
async function press(label: string) { await act(async () => s.actions.get(label)!()); await flush(); }
async function refresh() { const query = cache.getQueryCache().getAll().find(query => query.queryKey.includes(path.endsWith("/") ? "message-directory" : "message-file"))!; await act(async () => { await query.fetch().catch(() => {}); }); await flush(); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; cache?.clear(); shown = true; path = "a.txt"; s.active = s.allowed = true; s.epoch = 0; s.kind = "success"; s.locale = "en"; s.text = "Original source"; s.entries = [{ name: "a.txt", path: "/project/a.txt", isDir: false }]; s.requests = []; s.waiting = []; s.actions.clear(); vi.unstubAllGlobals(); });

it("retires retry callbacks when the file reader closes", async () => {
  s.kind = "network"; await render(); const retry = s.actions.get("Retry")!; expect(s.requests).toHaveLength(1);
  expect(container.querySelector("[data-actions]")!.textContent).toContain("network"); expect(container.textContent!.match(/network/g)).toHaveLength(1);
  await press("Close"); await act(async () => retry()); await flush(); expect(s.requests).toHaveLength(1);
});
it("keeps denied directory rows concealed through a network failure", async () => {
  await render("docs/"); expect(container.textContent).toContain("a.txt"); s.kind = "auth"; await refresh(); expect(container.textContent).not.toContain("a.txt");
  s.kind = "network"; await refresh(); expect(container.textContent).not.toContain("a.txt");
});
it("retires a removed directory row callback after refresh", async () => {
  await render("docs/"); const open = s.actions.get("a.txt")!; s.entries = []; await refresh();
  await act(async () => open()); await flush(); expect(container.querySelectorAll("section")).toHaveLength(1);
});
it("rejects a nested navigation context from another project", async () => {
  await render(); await act(async () => s.openChild!("child.txt", { ...s.childContext!, projectId: "other" })); await flush();
  expect(container.querySelectorAll("section")).toHaveLength(1);
});
it("retires a row callback when search hides that row", async () => {
  await render("docs/"); const open = s.actions.get("a.txt")!; await act(async () => s.search!("missing"));
  await act(async () => open()); await flush(); expect(container.querySelectorAll("section")).toHaveLength(1);
});
it("does not let an old clear action wipe a newer search", async () => {
  await render("docs/"); await act(async () => s.search!("missing")); const clear = s.actions.get("Clear search")!;
  await act(async () => s.search!("a")); await act(async () => clear()); expect(container.querySelector("input")!.value).toBe("a");
});
it("retires the pre-child input callback without losing the search on return", async () => {
  await render("docs/"); await act(async () => s.search!("a")); const oldInput = s.search!;
  await press("a.txt"); expect(container.querySelectorAll("section")).toHaveLength(2); await press("Close");
  await act(async () => oldInput("retired")); expect(container.querySelector("input")!.value).toBe("a");
});
it("preserves exact file and directory read parameters", async () => {
  await render(); expect(s.requests[0]).toEqual({ method: "workspace.run", params: { command: "read_text_file", args: { path: "/project/a.txt" } } });
  await render("docs/"); expect(s.requests.at(-1)).toEqual({ method: "files.list", params: { projectId: "project", cwd: "/project", path: "docs" } });
});
it("keeps the focused line window and the full original source", async () => {
  s.text = Array.from({ length: 30 }, (_, index) => `line${index + 1}`).join("\n"); await render("a.txt#L15");
  const snippet = container.querySelector("[data-snippet]")!.textContent!;
  expect(snippet).toContain("10 line10"); expect(snippet).toContain("15 line15"); expect(snippet).toContain("20 line20"); expect(snippet).not.toContain("21 line21");
  expect(container.querySelector("[data-source]")!.textContent).toBe(s.text);
});
it("keeps outside-project paths out of transport, including forced query execution", async () => {
  await render("/outside/secret.txt"); expect(s.requests).toHaveLength(0); expect(container.textContent).toContain("outside this project");
  await refresh(); expect(s.requests).toHaveLength(0);
});
it.each(["a.txt", "docs/"])("retains denial across %s reopen until completed success", async nextPath => {
  await render(nextPath); s.kind = "auth"; await refresh(); s.kind = "network"; await refresh();
  await press("Close"); shown = true; await render(nextPath);
  expect(container.textContent).not.toContain(nextPath.endsWith("/") ? "a.txt" : "Original source");
  s.kind = "success"; await press("Retry"); expect(container.textContent).toContain(nextPath.endsWith("/") ? "a.txt" : "Original source");
});
it("checks epoch retirement before React commits", async () => {
  await render(); const open = s.openChild!, next = s.childContext!; s.epoch = 1;
  await act(async () => open("child.txt", next)); await flush(); expect(container.querySelectorAll("section")).toHaveLength(1); expect(s.requests).toHaveLength(1);
  await refresh(); expect(s.requests).toHaveLength(1);
});
it.each(["background", "private"])("masks directory search through %s loss and retires its old events", async kind => {
  await render("docs/"); await act(async () => s.search!("a")); const oldInput = s.search!, oldRow = s.actions.get("a.txt")!;
  if (kind === "background") s.active = false; else s.allowed = false;
  await render(); expect(container.querySelector("input")).toBeNull();
  s.active = s.allowed = true; await render();
  await act(async () => { oldInput("retired"); oldRow(); }); await flush();
  expect(container.querySelector("input")!.value).toBe("a"); expect(container.querySelectorAll("section")).toHaveLength(1);
});
it("accepts batched Turkish search changes without replacing the input", async () => {
  s.locale = "tr"; s.entries = [{ name: "İLETİŞİM.txt", path: "/project/İLETİŞİM.txt", isDir: false }]; await render("docs/");
  const input = container.querySelector("input"), change = s.search!; await act(async () => { change("ile"); change("iletişim"); });
  expect(container.querySelector("input")).toBe(input); expect(input!.value).toBe("iletişim"); expect(container.textContent).toContain("İLETİŞİM.txt");
});
it("serializes refreshes and rejects late results after close", async () => {
  await render(); s.kind = "hold"; const refresh = s.actions.get("Refresh")!;
  await act(async () => { refresh(); refresh(); }); await flush(); expect(s.requests).toHaveLength(2);
  await press("Close"); await act(async () => s.waiting[0]("late source")); await flush();
  expect(container.querySelector("section")).toBeNull(); expect(cache.getQueryCache().getAll().some(query => query.state.data === "late source")).toBe(false);
});
it("retires the descendant client and old navigation after the reader closes", async () => {
  await render(); const client = s.childContext!.client, open = s.openChild!, child = s.childContext!; await press("Close");
  await expect(client.request("workspace.run", {})).rejects.toThrow(); await act(async () => open("child.txt", child)); await flush(); expect(s.requests).toHaveLength(1);
});
