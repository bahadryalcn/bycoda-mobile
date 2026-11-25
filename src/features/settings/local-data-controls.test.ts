// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  machines: [{ id: "a", name: "Original computer", endpoint: "https://original.example", environmentId: "host", lanKey: "original-key" }],
  hydrated: true, storageError: null as string | null, connectionPending: false,
  flush: vi.fn(async () => {}), remove: vi.fn(), revoke: vi.fn(async () => {}), files: vi.fn(), media: vi.fn(), cleanup: vi.fn(), access: vi.fn(),
  storage: { getItem: vi.fn(async () => "stored draft"), getAllKeys: vi.fn(async () => ["bycoda.mobile.draft.v1:a:s", "sdk.setting"]), multiRemove: vi.fn(async () => {}) },
}));
function store() { return { machines: state.machines, hydrated: state.hydrated, storageError: state.storageError, connectionPending: state.connectionPending, removeMachine: state.remove }; }
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/state/machines", () => ({ useMachines: Object.assign(() => store(), { getState: store }), withDisconnectedComputers: async (operation: () => Promise<unknown>) => {
  state.cleanup(); if (state.machines.length) throw new Error("Disconnect computers before deleting saved drafts."); return operation();
} }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/security", () => ({ assertAppAccess: state.access }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: state.storage }));
vi.mock("@/features/workspace/draft-guard", () => ({ flushWorkspaceDrafts: state.flush }));
vi.mock("@/features/privacy/provider-consent", () => ({ revokeProviderConsent: state.revoke }));
vi.mock("@/features/workspace/attachment-files", () => ({ clearAttachmentDraftFiles: state.files }));
vi.mock("@/ui/media-loader", () => ({ clearMediaCache: state.media }));
vi.mock("./local-data-caches", () => ({ LocalDataCaches: () => null }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (action: () => void) => action() }) }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: ({ children }: PropsWithChildren) => children }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("lucide-react-native/icons/shield-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash", () => ({ default: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, metadata }: { title: string; metadata: string }) => createElement("p", null, title, " ", metadata) }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label);
  return { Stack: Wrap, Body: Wrap, Button, SettingIcon: () => null, Loading: ({ label }: { label: string }) => createElement("p", null, label), NavigationGroup: Wrap, NavigationRow: Button,
    SectionHeader: ({ title, trailing }: { title: string; trailing?: import("react").ReactNode }) => createElement("h3", null, title, trailing),
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) => createElement("div", null, createElement("p", null, title), description ? createElement("p", null, description) : null, action ? createElement("button", { onClick: action.onPress }, action.label) : null), Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Sheet: ({ children, title }: PropsWithChildren<{ title: string }>) => createElement("section", { "data-review": true }, createElement("h2", null, title), children),
    FormActions: ({ submitLabel, cancelLabel, onSubmit, onCancel, disabled, busy, feedback }: import("@/ui/component-props").FormActionsProps) => createElement("footer", null, feedback, createElement(Button, { label: submitLabel, onPress: onSubmit, disabled, busy }), onCancel ? createElement(Button, { label: cancelLabel ?? "Cancel", onPress: onCancel, disabled: busy }) : null),
    ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: import("react").ReactNode; renderItem: (value: { item: unknown }) => import("react").ReactNode }) => createElement("div", null, header, ...data.map(item => renderItem({ item }))),
    MutationState: ({ mutation, success }: { mutation: { error?: Error; isSuccess?: boolean }; success?: string }) => createElement("p", null, mutation.error?.message ?? (mutation.isSuccess ? success : null)),
  };
});
import { LocalDataControls } from "./local-data-controls";
let root: ReturnType<typeof createRoot> | undefined, node: HTMLDivElement, cache: QueryClient;
const original = () => ({ id: "a", name: "Original computer", endpoint: "https://original.example", environmentId: "host", lanKey: "original-key" });
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); cache = new QueryClient(); } await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(LocalDataControls)))); }
async function click(label: string) { await act(async () => { [...node.querySelectorAll("button")].find(button => button.textContent === label)!.click(); await new Promise(done => setTimeout(done, 0)); }); }
const review = () => click("Remove saved computers"), confirm = () => click("Remove computers");
function removeNormally() { state.remove.mockImplementation(async (id: string) => { state.machines = state.machines.filter(machine => machine.id !== id); }); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); cache?.clear(); state.machines = [original()]; state.hydrated = true; state.storageError = null; state.connectionPending = false; vi.clearAllMocks(); state.flush.mockReset().mockResolvedValue(); state.remove.mockReset(); state.revoke.mockReset().mockResolvedValue(); state.access.mockReset(); state.storage.multiRemove.mockReset().mockResolvedValue(); state.storage.getItem.mockReset().mockResolvedValue("stored draft"); vi.unstubAllGlobals(); });
it("reviews exact computer names/routes and removes only their approved identities", async () => {
  removeNormally(); await render(); await review(); expect(state.remove).not.toHaveBeenCalled();
  expect(node.querySelector("[data-review]")!.textContent).toContain("Original computer https://original.example");
  expect(node.querySelector("footer")!.textContent).not.toContain("All saved computers");
  await confirm(); expect(state.remove).toHaveBeenCalledExactlyOnceWith("a", expect.objectContaining(original()));
  expect(state.flush).toHaveBeenCalledOnce(); expect(state.storage.multiRemove).not.toHaveBeenCalled();
});
it("does not revive a review after an extra computer appears and disappears", async () => {
  await render(); await review(); state.machines = [original(), { ...original(), id: "new" }]; await render();
  state.machines = [original()]; await render(); await confirm(); expect(state.remove).not.toHaveBeenCalled(); expect(node.textContent).toContain("Reopen this review");
});
it("does not remove any connection added during draft flush and renders its failure once", async () => {
  let release!: () => void; state.flush.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await render(); const cancel = vi.spyOn(cache, "cancelQueries"); await review(); await confirm(); expect([...node.querySelectorAll("button")].find(button => button.textContent === "Cancel")!.disabled).toBe(true); state.machines = [original(), { ...original(), id: "new" }];
  await act(async () => { release(); await new Promise(done => setTimeout(done, 0)); });
  expect(state.remove).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  await vi.waitFor(async () => { await act(async () => { await new Promise(done => setTimeout(done, 0)); }); expect(node.textContent?.match(/Review the current list before removing connections/g)).toHaveLength(1); });
});
it("retries a partial removal without repeating the already removed computer", async () => {
  state.machines = [original(), { ...original(), id: "b", name: "Second computer" }]; let fail = true;
  state.remove.mockImplementation(async (id: string) => { if (id === "b" && fail) throw new Error("secure storage unavailable"); state.machines = state.machines.filter(machine => machine.id !== id); });
  await render(); const removeCache = vi.spyOn(cache, "removeQueries"); await review(); await confirm(); expect(state.machines.map(machine => machine.id)).toEqual(["b"]);
  fail = false; await confirm(); expect(state.remove.mock.calls.map(([id]) => id)).toEqual(["a", "b", "b"]);
  expect(removeCache.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([["machine", "a"], ["machine", "b"]]);
});
it("cancels a failed review without leaving a duplicate error behind the sheet", async () => {
  state.remove.mockRejectedValue(new Error("secure storage unavailable")); await render(); await review(); await confirm();
  expect(node.textContent?.match(/secure storage unavailable/g)).toHaveLength(1); await click("Cancel"); expect(node.textContent).not.toContain("secure storage unavailable");
});
it("retires draft deletion when a computer is added after review", async () => {
  state.machines = []; await render(); await click("Delete saved drafts"); state.machines = [original()]; await render(); state.machines = []; await render();
  await click("Delete drafts"); expect(state.storage.multiRemove).not.toHaveBeenCalled(); expect(state.cleanup).not.toHaveBeenCalled();
});
it("keeps attachment/cache cleanup untouched when saved-draft deletion fails", async () => {
  state.machines = []; state.storage.multiRemove.mockRejectedValueOnce(new Error("draft deletion failed"));
  await render(); await click("Delete saved drafts"); await click("Delete drafts"); expect(state.cleanup).toHaveBeenCalledOnce();
  expect(state.files).not.toHaveBeenCalled(); expect(state.media).not.toHaveBeenCalled(); expect(node.textContent?.match(/draft deletion failed/g)).toHaveLength(1);
});
it("withdraws consent only after flushing drafts and cancelling host reads", async () => {
  await render(); const cancel = vi.spyOn(cache, "cancelQueries"); await click("Withdraw data sharing permission"); expect(state.revoke).not.toHaveBeenCalled(); await click("Withdraw permission");
  expect(state.flush).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledWith({ queryKey: ["machine"] }); expect(state.revoke).toHaveBeenCalledOnce();
  expect(state.flush.mock.invocationCallOrder[0]).toBeLessThan(state.revoke.mock.invocationCallOrder[0]); expect(state.remove).not.toHaveBeenCalled();
});
it("does not start local removal after access is locked", async () => {
  await render(); await review(); state.access.mockImplementation(() => { throw new Error("locked"); }); await confirm(); expect(state.remove).not.toHaveBeenCalled(); expect(state.flush).not.toHaveBeenCalled();
});

it("explains unavailable connection storage without exposing destructive controls as usable", async () => {
  state.storageError = "storage unavailable"; await render(); expect(node.textContent).toContain("Open Computers to reload");
  await review(); expect(state.remove).not.toHaveBeenCalled(); expect(node.querySelector("[data-review]")).toBeNull();
});

it("reports preserved pending drafts and passes their staging scope to file cleanup", async () => {
  state.machines = []; state.storage.getItem.mockResolvedValue('bycoda-composer-v2:\n'+JSON.stringify({ version: 2, text: "pending", attachments: [], selectedMentionRefs: [], queueIntent: { id: "operation", contentDigest: "a".repeat(64) } }));
  await render(); await click("Delete saved drafts"); expect(node.textContent).toContain("Reconnect the original computer"); await click("Delete drafts");
  expect(state.storage.multiRemove).not.toHaveBeenCalled(); expect(state.files).toHaveBeenCalledExactlyOnceWith(["a:s"]);
  await vi.waitFor(async () => { await act(async () => { await new Promise(done => setTimeout(done, 0)); }); expect(node.textContent).toContain("kept for recovery"); });
});
