// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PrivateContentAccessProvider } from "@/ui/private-access";
import type { MessageContext } from "@/ui/media-policy";
import { AttachmentFile } from "./transcript-attachments";

const state = vi.hoisted(() => {
  const machine = { id: "machine", name: "Computer", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic" };
  const transport = vi.fn(async () => "allowed");
  return { machine, client: { machine, request: transport }, transport, active: true, allowed: true, available: true, epoch: 0,
    actions: new Map<string, () => void>(), reload: undefined as undefined | (() => void), previewCheck: undefined as undefined | (() => boolean), previewContext: undefined as undefined | MessageContext,
    imageFail: undefined as undefined | (() => void),
    kind: "success", confirm: vi.fn(), load: vi.fn(async () => ({ uri: "file:///synthetic/report.txt", name: "Report.txt", mimeType: "text/plain" })) };
});
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/state/data-saver", () => ({ useDataSaverActive: () => false }));
vi.mock("lucide-react-native/icons/file", () => ({ default: () => null }));
vi.mock("expo-image", () => ({ Image: ({ contentFit, accessibilityLabel, onError }: any) => { state.imageFail = onError; return h("span", { "data-image-fit": contentFit }, accessibilityLabel); } }));
vi.mock("lucide-react-native/icons/file-text", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/film", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/maximize-2", () => ({ default: () => null }));
vi.mock("panelui-native/components/attachment", () => {
  const Attachment: any = ({ accessibilityLabel, onPress, children }: any) => h("button", { "aria-label": accessibilityLabel, onClick: onPress }, children);
  Attachment.Media = ({ children }: any) => h("span", null, children);
  return { Attachment };
});
vi.mock("./composer-links", () => ({ ComposerLinks: () => null }));
vi.mock("./attachment-presentation", () => ({ composerLinks: () => [] }));
vi.mock("./draft-append", () => ({ appendToDraft: () => {} }));
vi.mock("@/ui/media-viewer", () => ({ MediaViewer: () => null }));
vi.mock("@/ui/media-video", () => ({ InlineVideo: () => null }));
vi.mock("@/ui/use-media-sharing", () => ({ useMediaSharing: () => ({ share: () => {}, busy: false, error: null }) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (...args: unknown[]) => state.confirm(...args) }));
vi.mock("lucide-react-native/icons/image", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ colors: {}, space: {}, radii: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: state.machine.id, machines: [state.machine] }) } }));
vi.mock("@/state/connection-scope", () => {
  const scopes = new Map<number, any>();
  return { useConnectionScope: () => { const epoch = state.epoch; if (!scopes.has(epoch)) scopes.set(epoch, { token: `epoch-${epoch}`, isCurrent: () => state.epoch === epoch }); return scopes.get(epoch); } };
});
vi.mock("@/state/queries", async () => {
  const { usePrivateContentAccess } = await import("@/ui/private-access");
  const { useMemo } = await import("react");
  return { useHostReadActive: () => state.active, useHostClient: () => { const access = usePrivateContentAccess(); return useMemo(() => !state.available || !access.allowed || !access.check() ? null : { ...state.client, request: async () => { if (!access.check()) throw new Error("Retired access"); return state.transport(); } }, [access, state.available]); } };
});
vi.mock("@/ui/media-loader", () => ({ loadSessionMedia: (...args: unknown[]) => {
  if (state.kind !== "success") { state.load(); return Promise.reject(Object.assign(new Error(state.kind), { kind: state.kind })); }
  return state.load(...args as []);
} }));
vi.mock("@/ui/chat-controls", () => ({ ChatSummary: ({ label, onPress, disabled }: any) => { state.actions.set("Open", onPress); return h("button", { disabled, onClick: onPress }, label); } }));
vi.mock("@/ui/document-preview", async () => {
  const { usePrivateContentAccess } = await import("@/ui/private-access");
  return { DocumentPreview: ({ uri, onReload, context }: any) => { state.reload = onReload; state.previewCheck = usePrivateContentAccess().check; state.previewContext = context; return h("p", { "data-document": true }, uri); } };
});
vi.mock("@/ui/primitives", () => {
  const Button = ({ label, onPress, busy, disabled }: any) => { state.actions.set(label, onPress); return h("button", { disabled: busy || disabled, onClick: onPress }, label); };
  const Pressable = ({ label, onPress, children }: any) => h("button", { "aria-label": label, onClick: onPress }, children);
  return { Button, PressableCard: Pressable, IconButton: Pressable, Body: ({ children }: PropsWithChildren) => h("p", null, children), Notice: ({ message }: any) => h("p", null, message), StateView: ({ title }: any) => h("p", null, title), Loading: () => h("p", null, "Loading"), ErrorText: ({ error }: any) => error ? h("p", null, String(error.message)) : null,
    Sheet: ({ visible, title, onClose, children, footer }: any) => { state.actions.set("Close", onClose); return visible ? h("section", { "aria-label": title }, children, footer, h(Button, { label: "Close", onPress: onClose })) : null; },
    FormActions: ({ submitLabel, onSubmit, cancelLabel, onCancel, busy, disabled, feedback }: any) => h("div", null, h(Button, { label: submitLabel, onPress: onSubmit, busy, disabled }), onCancel ? h(Button, { label: cancelLabel, onPress: onCancel }) : null, feedback),
  };
});
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement, cache: QueryClient;
const context = { machineId: "machine", projectId: "project", sessionId: "session", cwd: "/original", client: state.client } as unknown as MessageContext;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
async function render(id = "file", props: Record<string, unknown> = {}) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); container = document.createElement("div"); root = createRoot(container); } await act(async () => root!.render(h(QueryClientProvider, { client: cache }, h(PrivateContentAccessProvider, { value: { allowed: state.allowed, check: () => state.allowed } }, h(AttachmentFile, { id, name: "Report.txt", image: false, mimeType: "text/plain", size: 100, context, ...props }))))); await flush(); }
/** The explicit two-step flow: Download the file, then Open the reader. */
async function open() { await press("Download"); await press("Open"); }
async function press(name: string) { await act(async () => state.actions.get(name)!()); await flush(); }

it("opens a downloaded PDF in the document reader", async () => {
  state.load.mockResolvedValueOnce({ uri: "file:///report.pdf", name: "Report.pdf", mimeType: "application/pdf" });
  await render("pdf", { name: "Report.pdf", mimeType: "application/pdf" });
  await open();
  expect(container.querySelector("[data-document]")?.textContent).toBe("file:///report.pdf");
});

it("shows the whole sent image instead of cropping screenshots to the thumbnail square", async () => {
  await render("photo", { name: "Screenshot.png", image: true, mimeType: "image/png", thumbnail: true });
  expect(container.querySelector("[data-image-fit]")?.getAttribute("data-image-fit")).toBe("contain");
});

it("offers a guarded retry when a downloaded image cannot be decoded", async () => {
  await render("photo", { name: "Screenshot.png", image: true, mimeType: "image/png", thumbnail: true });
  expect(state.imageFail).toBeTypeOf("function");
  await act(async () => state.imageFail!());
  expect(container.textContent).toContain("Preview could not be opened.");
  await press("Retry");
  expect(state.load).toHaveBeenCalledTimes(2);
  await act(async () => state.imageFail!());
  const retry = state.actions.get("Retry")!;
  state.allowed = false;
  await act(async () => retry());
  expect(state.load).toHaveBeenCalledTimes(2);
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; cache?.clear(); state.actions.clear(); state.load.mockClear(); state.confirm.mockClear(); state.transport.mockClear(); state.kind = "success"; state.active = state.allowed = state.available = true; state.epoch = 0; state.reload = state.previewCheck = state.previewContext = undefined; vi.unstubAllGlobals(); });

it("rejects captured reload after closing and reopening the same attachment", async () => {
  await render(); await open(); expect(state.load).toHaveBeenCalledOnce(); const oldReload = state.reload!;
  await press("Close"); await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledOnce();
  await press("Open"); expect(container.querySelector("[data-document]")).not.toBeNull(); await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledOnce();
});
it("keeps cached data concealed after auth then network failure, including reopen", async () => {
  await render(); await open(); expect(container.querySelector("[data-document]")).not.toBeNull();
  state.kind = "auth"; await act(async () => state.reload!()); await flush(); expect(container.querySelector("[data-document]")).toBeNull();
  state.kind = "network"; await press("Retry file"); expect(container.querySelector("[data-document]")).toBeNull();
  await press("Close"); await press("Open"); expect(container.querySelector("section")).toBeNull(); expect(container.querySelector("[data-document]")).toBeNull();
  expect(Array.from(container.querySelectorAll("button")).map(b => b.textContent)).toEqual(["Retry"]);
  state.kind = "success"; await press("Retry"); expect(container.querySelector("[data-document]")).toBeNull(); await press("Open"); expect(container.querySelector("[data-document]")).not.toBeNull();
});
it("retires descendant private reads when the individual preview closes", async () => {
  await render(); await open(); const oldCheck = state.previewCheck!, oldClient = state.previewContext!.client;
  await press("Close"); expect(oldCheck()).toBe(false); await expect(oldClient.request("read", {})).rejects.toThrow(); expect(state.transport).not.toHaveBeenCalled();
});
it("requires a fresh explicit opening when the attachment identity changes", async () => {
  await render(); await open(); await render("other-file"); expect(container.querySelector("section")).toBeNull(); expect(state.load).toHaveBeenCalledOnce();
  await press("Download"); expect(state.load).toHaveBeenCalledTimes(2); await press("Open"); expect(container.querySelector("[data-document]")).not.toBeNull();
});
it("rejects queued row opens after a preview has been closed", async () => {
  await render(); await press("Download"); const oldOpen = state.actions.get("Open")!; await press("Open"); await press("Close");
  await act(async () => oldOpen()); await flush(); expect(container.querySelector("section")).toBeNull(); expect(state.load).toHaveBeenCalledOnce();
});
it("disables unavailable rows and blocks their captured open callbacks", async () => {
  await render(); await press("Download"); const oldOpen = state.actions.get("Open")!; state.active = false; await render();
  expect(container.querySelector("button")!.disabled).toBe(true); await act(async () => oldOpen()); await flush(); expect(container.querySelector("section")).toBeNull(); expect(state.load).toHaveBeenCalledOnce();
});
it.each(["background", "private", "client"])("retires old reload and descendant authority across temporary %s loss", async kind => {
  await render(); await open(); const oldReload = state.reload!, oldCheck = state.previewCheck!;
  if (kind === "background") state.active = false;
  if (kind === "private") state.allowed = false;
  if (kind === "client") state.available = false;
  await render(); expect(container.querySelector("[data-document]")).toBeNull(); expect(oldCheck()).toBe(false);
  state.active = state.allowed = state.available = true; await render();
  await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledOnce(); expect(oldCheck()).toBe(false);
});
it("refuses old epoch callbacks before React commits and after a new explicit opening", async () => {
  await render(); await open(); const oldReload = state.reload!, oldCheck = state.previewCheck!;
  state.epoch = 1; expect(oldCheck()).toBe(false); await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledOnce();
  await render(); expect(container.querySelector("[data-document]")).toBeNull(); await press("Close"); await press("Open");
  await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledOnce(); expect(oldCheck()).toBe(false);
});
it("discards a late result from a row that was replaced and permits a fresh explicit read", async () => {
  let finish!: (value: { uri: string; name: string; mimeType: string }) => void;
  state.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await press("Download"); expect(state.load).toHaveBeenCalledOnce(); await render("other-file");
  await act(async () => finish({ uri: "file:///late", name: "Report.txt", mimeType: "text/plain" })); await flush();
  expect(container.querySelector("section")).toBeNull(); expect(cache.getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true);
  await press("Download"); expect(state.load).toHaveBeenCalledTimes(2); await press("Open"); expect(container.querySelector("[data-document]")).not.toBeNull();
});
it("discards a late result after the reader closed", async () => {
  await render(); await open(); await press("Close"); const query = cache.getQueryCache().getAll()[0]!;
  expect(container.querySelector("section")).toBeNull(); expect(query.state.data).toBeDefined(); expect(state.load).toHaveBeenCalledOnce();
});
it("serializes captured retries without cancelling an in-flight file read", async () => {
  await render(); await open(); state.kind = "network"; await act(async () => state.reload!()); await flush();
  let finish!: (value: { uri: string; name: string; mimeType: string }) => void;
  state.kind = "success"; state.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const retry = state.actions.get("Retry file")!; await act(async () => { retry(); retry(); }); await flush(); expect(state.load).toHaveBeenCalledTimes(3);
  await act(async () => finish({ uri: "file:///fresh", name: "Report.txt", mimeType: "text/plain" })); await flush();
  expect(container.querySelector("[data-document]")!.textContent).toBe("file:///fresh");
});
it("guards the cached query function itself after its reader unmounts", async () => {
  await render(); await open(); const query = cache.getQueryCache().getAll()[0]!;
  await act(async () => root!.unmount()); root = undefined; await expect(query.fetch()).rejects.toThrow("unavailable"); expect(state.load).toHaveBeenCalledOnce();
});
it("retires descendant authority and content reload on denial without disabling explicit repair", async () => {
  await render(); await open(); const oldCheck = state.previewCheck!, oldReload = state.reload!;
  state.kind = "auth"; await act(async () => oldReload()); await flush(); expect(oldCheck()).toBe(false);
  await act(async () => oldReload()); await flush(); expect(state.load).toHaveBeenCalledTimes(2);
  state.kind = "success"; await press("Retry file"); expect(container.querySelector("[data-document]")).not.toBeNull(); expect(oldCheck()).toBe(false);
});
it("retires replaced error controls and content callbacks after fresh media", async () => {
  await render(); await open(); const oldReload = state.reload!;
  state.kind = "network"; await act(async () => oldReload()); await flush(); const oldRetry = state.actions.get("Retry file")!;
  state.kind = "success"; state.load.mockResolvedValueOnce({ uri: "file:///fresh-version", name: "Report.txt", mimeType: "text/plain" });
  await press("Retry file"); expect(state.load).toHaveBeenCalledTimes(3);
  await act(async () => { oldReload(); oldRetry(); }); await flush(); expect(state.load).toHaveBeenCalledTimes(3);
});

it("never downloads a file before an explicit press, and confirms large or unknown sizes first", async () => {
  await render("big", { size: 5 * 1024 * 1024 }); await flush(); expect(state.load).not.toHaveBeenCalled();
  await press("Download"); expect(state.confirm).toHaveBeenCalledOnce(); expect(state.load).not.toHaveBeenCalled();
  await act(async () => (state.confirm.mock.calls[0] as unknown as [string, string, string, () => void])[3]()); await flush(); expect(state.load).toHaveBeenCalledOnce();
});
it("refuses to download a file that is too large", async () => {
  await render("huge", { size: Number.MAX_SAFE_INTEGER }); expect(state.actions.has("Download")).toBe(false); expect(state.load).not.toHaveBeenCalled();
});
it.each(["background", "private", "client"])("does not auto-load an inline image while %s access is unavailable", async kind => {
  if (kind === "background") state.active = false;
  if (kind === "private") state.allowed = false;
  if (kind === "client") state.available = false;
  await render("pic", { name: "pic.png", image: true, mimeType: "image/png", size: 1024 }); expect(state.load).not.toHaveBeenCalled();
  state.active = state.allowed = state.available = true; await render("pic", { name: "pic.png", image: true, mimeType: "image/png", size: 1024 }); expect(state.load).toHaveBeenCalledOnce();
});

it("passes the filename-derived MIME to the reader when MIME is missing", async () => {
  state.active = state.allowed = state.available = true;
  await render("missing-mime", { name: "portrait.png", image: true, mimeType: undefined, size: 1024 });
  expect(state.load).toHaveBeenCalledWith(expect.anything(), "missing-mime", "portrait.png", "image/png", expect.anything());
});
