// @vitest-environment jsdom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionFiles } from "./session-files";
import type { HostSession } from "./wire";
import { PrivateContentAccessProvider } from "@/ui/private-access";

const state = vi.hoisted(() => {
  const machine = { id: "machine", name: "Original computer", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic" };
  return { machine, client: { machine }, available: true, active: true, activeId: "machine", epoch: 0, parentAllowed: true, error: null as unknown, success: false,
    readChecks: [] as (() => boolean)[], actions: new Map<string, () => void>(), load: vi.fn(async () => {}), pending: false, search: undefined as undefined | ((value: string) => void), filters: new Map<string, (value: string) => void>(), locale: "en" };
});
vi.mock("react-native", () => {
  const View = ({ children, style, contentContainerStyle, pointerEvents, accessibilityElementsHidden, importantForAccessibility, ...props }: any) => h("div", { ...props, style: Object.assign({}, ...(Array.isArray(style) ? style : [style])) }, children);
  return { View, ScrollView: View };
});
vi.mock("lucide-react-native/icons/paperclip", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sliders-horizontal", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ colors: {}, space: {}, metrics: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, args?: Record<string, unknown>) => en.replace(/\{(\w+)\}/g, (_match, key) => String(args?.[key] ?? key)) }));
vi.mock("@/i18n", () => ({ useLocale: () => state.locale }));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/ui/use-list-scroll-memory", () => ({ useFilteredListScrollMemory: () => ({ listProps: {} }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine, useMachines: { getState: () => ({ activeId: state.activeId, machines: [state.machine] }) } }));
vi.mock("@/state/connection-scope", () => {
  const scopes = new Map<number, any>();
  return { useConnectionScope: () => { const epoch = state.epoch; if (!scopes.has(epoch)) scopes.set(epoch, { token: `epoch-${epoch}`, isCurrent: () => state.epoch === epoch }); return scopes.get(epoch); } };
});
vi.mock("@/state/queries", async () => {
  const { usePrivateContentAccess } = await import("@/ui/private-access");
  return { useHostClient: () => { const access = usePrivateContentAccess(); return state.available && access.allowed && access.check() ? state.client : null; }, useHostReadActive: () => state.active };
});
vi.mock("./session-queries", () => ({ useEarlierSession: () => ({ mutateAsync: state.load, isPending: state.pending, error: state.error, isSuccess: state.success }) }));
vi.mock("./transcript-attachments", async () => {
  const { usePrivateContentAccess } = await import("@/ui/private-access");
  return { AttachmentFile: ({ name }: { name: string }) => { const access = usePrivateContentAccess(); state.readChecks.push(access.check); return h("button", null, name); } };
});
vi.mock("@/ui/chat-controls", () => ({ ChatAction: ({ label, onPress }: any) => h("button", { onClick: onPress }, label) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => h("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) => { state.actions.set(label, onPress); return h("button", { disabled: disabled || busy, onClick: onPress }, label); };
  return { Body: Wrapper, Row: Wrapper, Notice: ({ message }: any) => h("p", null, message), StateView: ({ title }: any) => h("p", null, title), Badge: ({ label }: any) => h("span", null, label), Button, IconButton: Button, ErrorText: () => null,
    Sheet: ({ visible, title, children, footer }: any) => visible ? h("section", { "aria-label": title }, children, footer) : null,
    FormActions: ({ submitLabel, onSubmit, cancelLabel, onCancel, cancelDisabled }: any) => h("div", null, h(Button, { label: submitLabel, onPress: onSubmit }), onCancel ? h(Button, { label: cancelLabel, onPress: onCancel, disabled: cancelDisabled }) : null),
    SearchField: ({ label, value, onChangeText }: any) => { state.search = onChangeText; return h("input", { "aria-label": label, value, onChange: (event: any) => onChangeText(event.target.value) }); },
    SelectField: ({ label, value, onChange, options }: any) => { state.filters.set(label, onChange); return h("select", { "aria-label": label, value, onChange: (event: any) => onChange(event.target.value) }, options.map((option: any) => h("option", { key: option.value, value: option.value }, option.label))); },
    Empty: ({ title, action }: any) => h("div", null, title, action ? h(Button, { label: action.label, onPress: action.onPress }) : null),
    ScreenList: ({ data, renderItem, footer, ListEmptyComponent, header }: any) => h("div", { "data-list": true }, header, data.length ? data.map((item: any) => h("div", { key: item.key }, renderItem({ item }))) : ListEmptyComponent, footer),
  };
});
const session = { projectId: "project", history: { before: 1 }, session: { id: "session", cwd: "/original", blocks: [
  { id: "user", role: "user", text: "", attachments: [{ id: "pdf", name: "İLETİŞİM.pdf", mimeType: "application/pdf", kind: "file" }] },
  { id: "agent", role: "assistant", text: "", image: { name: "Preview.png", mimeType: "image/png" } },
] } } as unknown as HostSession;
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
async function rerender(value = session) { await act(async () => root!.render(h(PrivateContentAccessProvider, { value: { allowed: state.parentAllowed, check: () => state.parentAllowed } }, h(SessionFiles, { scope: { machineId: "machine", sessionId: "session" }, session: value })))); }
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await rerender(); await click("Session files"); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
async function search(value: string) { await act(async () => state.search!(value)); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.load.mockClear(); state.pending = false; state.locale = "en"; state.filters.clear(); state.actions.clear(); state.available = true; state.active = true; state.activeId = "machine"; state.epoch = 0; state.parentAllowed = true; state.error = null; state.success = false; state.readChecks = []; vi.unstubAllGlobals(); });

it("keeps the same search input outside the list while filtering", async () => {
  await render(); const input = container.querySelector("input")!;
  expect(container.querySelector("[data-list]")!.contains(input)).toBe(false);
  await search("Preview"); expect(container.querySelector("input")).toBe(input);
  expect(container.querySelector("[data-list]")!.textContent).toContain("Preview.png");
  expect(container.querySelector("[data-list]")!.textContent).not.toContain("İLETİŞİM.pdf");
});
it("uses the app language for file search", async () => {
  state.locale = "tr"; await render(); await search("iletişim");
  expect(container.querySelector("[data-list]")!.textContent).toContain("İLETİŞİM.pdf");
});
it("clears only search on no match and resets only filters from the filter footer", async () => {
  await render(); await click("File filters");
  await act(async () => state.filters.get("Sender")!("agent")); await click("Done");
  await search("absent"); await click("Clear search");
  expect(container.querySelector("[data-list]")!.textContent).toContain("Preview.png");
  expect(container.querySelector("[data-list]")!.textContent).not.toContain("İLETİŞİM.pdf");
  await search("Preview"); await click("File filters"); await click("Reset"); await click("Done");
  expect(container.querySelector("input")!.value).toBe("Preview");
});
it("retires closed search and filter callbacks without losing the current query", async () => {
  await render(); await search("Preview"); const oldSearch = state.search!;
  await click("File filters"); const oldFilter = state.filters.get("Sender")!; await click("Done");
  await act(async () => oldFilter("user")); expect(container.textContent).not.toContain("Filter active");
  await click("Close"); await click("Session files"); await act(async () => oldSearch("retired"));
  expect(container.querySelector("input")!.value).toBe("Preview");
});
it("loads earlier messages only on explicit action and retains the query across close", async () => {
  await render(); expect(state.load).not.toHaveBeenCalled(); await search("Preview");
  await click("Load earlier messages"); expect(state.load).toHaveBeenCalledOnce();
  await click("Close"); await click("Session files"); expect(container.querySelector("input")!.value).toBe("Preview");
});

it("shows access recovery instead of empty source rows when no client exists", async () => {
  state.available = false; await render();
  expect(container.textContent).toContain("Record access is unavailable");
  expect(container.querySelector("[data-list]")!.textContent).not.toContain("Preview.png");
  expect(container.querySelector("[data-list]")!.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(state.load).not.toHaveBeenCalled();
});
it.each(["client", "background", "private"])("retains search across temporary %s loss while retiring old read/input authority", async kind => {
  await render(); await search("Preview");
  const field = container.querySelector("input"), oldInput = state.search!, oldRead = state.readChecks.at(-1)!;
  expect(oldRead()).toBe(true);
  if (kind === "client") state.available = false;
  if (kind === "background") state.active = false;
  if (kind === "private") state.parentAllowed = false;
  await rerender(); expect(oldRead()).toBe(false); expect(container.querySelector("input")!.value).toBe("");
  state.available = state.active = state.parentAllowed = true;
  await rerender(); await act(async () => oldInput("retired"));
  expect(container.querySelector("input")).toBe(field);
  expect(container.querySelector("input")!.value).toBe("Preview");
  expect(oldRead()).toBe(false); expect(state.readChecks.at(-1)!()).toBe(true);
  expect(state.load).not.toHaveBeenCalled();
});
it("retires filters on concealment and does not reopen the panel on recovery", async () => {
  await render(); await click("File filters"); const oldFilter = state.filters.get("Sender")!;
  state.available = false; await rerender(); state.available = true; await rerender();
  expect(container.querySelector('section[aria-label="File filters"]')).toBeNull();
  await act(async () => oldFilter("agent")); expect(container.textContent).not.toContain("Filter active");
});
it("retires a closed reader check synchronously and permanently across reopen", async () => {
  await render(); const oldRead = state.readChecks.at(-1)!; expect(oldRead()).toBe(true);
  await click("Close"); expect(oldRead()).toBe(false);
  await click("Session files"); expect(oldRead()).toBe(false); expect(state.readChecks.at(-1)!()).toBe(true);
});
it("rejects precommit epoch and active-computer changes", async () => {
  await render(); const oldRead = state.readChecks.at(-1)!;
  state.activeId = "other"; expect(oldRead()).toBe(false); await click("Load earlier messages"); expect(state.load).not.toHaveBeenCalled();
  state.activeId = "machine"; state.epoch = 1; expect(oldRead()).toBe(false);
  await click("Load earlier messages"); expect(state.load).not.toHaveBeenCalled();
  await rerender(); expect(container.querySelector('section[aria-label="Session files"]')).toBeNull();
  await click("Session files"); expect(container.querySelector("input")!.value).toBe(""); expect(oldRead()).toBe(false);
});
it.each(["folder", "project", "session"])("retires readers when the original %s changes", async kind => {
  await render(); const oldRead = state.readChecks.at(-1)!;
  const changed = { ...session, projectId: kind === "project" ? "other-project" : session.projectId,
    session: { ...session.session, ...(kind === "folder" ? { cwd: "/other" } : kind === "session" ? { id: "other-session" } : {}) } } as HostSession;
  await rerender(changed); expect(oldRead()).toBe(false);
  expect(container.querySelector('section[aria-label="Session files"]')).toBeNull();
});
it("keeps denied metadata concealed through network failure and pending success until a fresh completed read", async () => {
  await render(); await search("Preview"); const oldRead = state.readChecks.at(-1)!;
  state.error = { kind: "auth" }; await rerender(); expect(oldRead()).toBe(false);
  expect(container.querySelector("input")!.value).toBe("");
  await click("Load earlier messages"); expect(state.load).toHaveBeenCalledOnce();
  state.error = new Error("Network failed"); await rerender(); expect(container.querySelector("input")!.value).toBe("");
  state.error = null; state.success = true; state.pending = true; await rerender(); expect(container.querySelector("input")!.value).toBe("");
  state.pending = false; await rerender(); expect(container.querySelector("input")!.value).toBe("Preview"); expect(oldRead()).toBe(false);
});
it("serializes explicit earlier reads and allows close during a pending read", async () => {
  let finish!: () => void; state.load.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(); await click("Load earlier messages"); await click("Load earlier messages"); expect(state.load).toHaveBeenCalledOnce();
  await click("Close"); await act(async () => finish());
  expect(container.querySelector('section[aria-label="Session files"]')).toBeNull();
});
it("rejects an old paging callback after the history cursor changes or is exhausted", async () => {
  await render(); const oldLoad = state.actions.get("Load earlier messages")!;
  await rerender({ ...session, history: { ...session.history!, before: 2 } });
  await act(async () => oldLoad()); expect(state.load).not.toHaveBeenCalled();
  const currentLoad = state.actions.get("Load earlier messages")!;
  await rerender({ ...session, history: { ...session.history!, before: undefined } });
  await act(async () => currentLoad()); expect(state.load).not.toHaveBeenCalled();
});
