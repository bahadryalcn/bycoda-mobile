// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PdfFrameProps } from "./pdf-frame-props";

const fixture = vi.hoisted(() => ({
  allowed: true, check: true, read: vi.fn(), frames: [] as PdfFrameProps[], closes: [] as (() => void)[],
  colors: { background: "canvas" },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: fixture.colors }) }));
vi.mock("./private-access", () => ({
  usePrivateContentAccess: () => ({ allowed: fixture.allowed, check: () => fixture.check }),
}));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("./pdf-data", async importOriginal => ({
  ...await importOriginal<typeof import("./pdf-data")>(), readPdfData: (...args: unknown[]) => fixture.read(...args),
}));
vi.mock("./pdf-html", () => ({ pdfHtml: (options: unknown) => JSON.stringify(options) }));
vi.mock("./pdf-frame", () => ({ PdfFrame: (props: PdfFrameProps) => {
  fixture.frames.push(props);
  return h("article", { "data-frame": props.fill ? "full" : "inline" }, props.title);
} }));
vi.mock("./primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("p", null, children),
  Loading: ({ label }: { label: string }) => h("p", { "data-loading": true }, label),
  ErrorText: ({ error }: { error: unknown }) => error ? h("p", { "data-error": true }, String(error)) : null,
  Button: ({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) =>
    h("button", { onClick: onPress, disabled: busy }, label),
  Sheet: ({ visible, children, onClose }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) => {
    if (visible) fixture.closes.push(onClose);
    return visible ? h("section", null, h("button", { onClick: onClose }, "Close sheet"), children) : null;
  },
}));
import { PdfDocument } from "./pdf-document";

let root: ReturnType<typeof createRoot>, client: QueryClient, container: HTMLDivElement;
const latest = () => fixture.frames.at(-1)!;
const options = (frame = latest()) => JSON.parse(frame.html) as { channel: string; position: { page: number; zoom: number } };
const position = (frame: PdfFrameProps, page: number, zoom = 1) => JSON.stringify({
  kind: "pdf-position", channel: options(frame).channel, page, zoom,
});
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const render = async (uri = "file:///report.pdf") => {
  await act(async () => root.render(h(QueryClientProvider, { client }, h(PdfDocument, { uri, name: "Report.pdf" }))));
  await flush();
};
const press = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(element => element.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click()); await flush();
};
function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>(accept => { resolve = accept; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.allowed = true; fixture.check = true; fixture.frames = []; fixture.closes = []; fixture.colors = { background: "canvas" };
  fixture.read.mockReset().mockResolvedValue("JVBERi0=");
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.unstubAllGlobals(); });

it("shows loading until local bytes resolve, then opens one inline frame", async () => {
  const pending = deferred(); fixture.read.mockReturnValue(pending.promise);
  await render(); expect(container.querySelector("[data-loading]")).not.toBeNull(); expect(fixture.frames).toHaveLength(0);
  await act(async () => pending.resolve("JVBERi0=")); await flush();
  expect(container.querySelector("[data-loading]")).toBeNull();
  expect(container.querySelectorAll("[data-frame]")).toHaveLength(1);
  expect(latest().fill).toBe(false); expect(options().position).toEqual({ page: 1, zoom: 1 });
});

it("keeps a failed local load recoverable and reloads only on retry", async () => {
  fixture.read.mockRejectedValueOnce(new Error("Local file unavailable"));
  await render(); expect(container.textContent).toContain("Local file unavailable"); expect(fixture.frames).toHaveLength(0);
  await press("Retry"); expect(fixture.read).toHaveBeenCalledTimes(2);
  expect(container.querySelector("[data-error]")).toBeNull(); expect(latest().title).toBe("Report.pdf");
});

it("reopens a failed renderer without rereading successful private bytes", async () => {
  await render(); const original = latest();
  await act(async () => original.onFailure());
  expect(container.querySelector("[data-frame]")).toBeNull(); expect(container.textContent).toContain("Preview stopped");
  await press("Retry"); expect(fixture.read).toHaveBeenCalledTimes(1);
  expect(options().channel).not.toBe(options(original).channel); expect(container.querySelector("[data-frame]")).not.toBeNull();
});

it("does not read when access is denied and hides previously loaded private bytes", async () => {
  fixture.allowed = false; await render(); expect(fixture.read).not.toHaveBeenCalled(); expect(container.textContent).toBe("");
  fixture.allowed = true; await render(); expect(container.querySelector("[data-frame]")).not.toBeNull();
  fixture.check = false; await render(); expect(container.textContent).toBe("");
});

it("rejects late local bytes after access revocation", async () => {
  const pending = deferred(); fixture.read.mockReturnValue(pending.promise); await render();
  fixture.check = false;
  await act(async () => pending.resolve("PRIVATE")); await flush(); await render();
  expect(fixture.frames).toHaveLength(0);
  expect(client.getQueryCache().getAll()[0]!.state.data).toBeUndefined();
});

it("cancels the read and ignores a completion after unmount", async () => {
  const pending = deferred(); fixture.read.mockReturnValue(pending.promise); await render();
  const signal = fixture.read.mock.calls[0]![1] as AbortSignal;
  await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve("PRIVATE")); await flush(); expect(fixture.frames).toHaveLength(0);
  expect(client.getQueryCache().getAll()[0]!.state.data).toBeUndefined();
});

it("keeps a late previous-file result out of the new opening", async () => {
  const pending = deferred(); fixture.read.mockReturnValueOnce(pending.promise).mockResolvedValue("NEW");
  await render("file:///old.pdf"); await render("file:///new.pdf");
  const current = latest();
  await act(async () => pending.resolve("OLD")); await flush();
  expect(latest()).toBe(current);
  expect(JSON.parse(current.html).base64).toBe("NEW");
  expect(fixture.read).toHaveBeenCalledTimes(2);
});

it("preserves reading page and zoom across expansion, close and theme replacement", async () => {
  await render(); const inline = latest();
  await act(async () => inline.onMessage(position(inline, 7, 1.5)));
  await press("Expand PDF"); const full = latest(); expect(full.fill).toBe(true);
  expect(options().position).toEqual({ page: 7, zoom: 1.5 });
  await act(async () => full.onMessage(position(full, 9, 2))); await press("Close sheet");
  expect(latest().fill).toBe(false); expect(options().position).toEqual({ page: 9, zoom: 2 });
  fixture.colors = { background: "night" }; await render(); expect(options().position).toEqual({ page: 9, zoom: 2 });
});

it("ignores old-frame callbacks after a new frame replaces them", async () => {
  await render(); const old = latest(); await press("Expand PDF"); const current = latest();
  await act(async () => current.onMessage(position(current, 8, 1.5)));
  await act(async () => { old.onMessage(position(old, 2)); old.onFailure(); });
  expect(container.querySelector('[data-frame="full"]')).not.toBeNull();
  await press("Close sheet"); expect(options().position).toEqual({ page: 8, zoom: 1.5 });
});

it("ignores frame messages and failures while private access is revoked", async () => {
  await render(); const frame = latest(); fixture.check = false;
  await act(async () => { frame.onMessage(position(frame, 99)); frame.onFailure(); });
  fixture.check = true; await press("Expand PDF");
  expect(options().position).toEqual({ page: 1, zoom: 1 });
  expect(container.textContent).not.toContain("Preview stopped");
});

it("ignores callbacks from a renderer replaced by a theme change", async () => {
  await render(); const old = latest();
  fixture.colors = { background: "night" }; await render(); const current = latest();
  await act(async () => current.onMessage(position(current, 6, 1.25)));
  await act(async () => { old.onMessage(position(old, 2)); old.onFailure(); });
  expect(container.querySelector("[data-frame]")).not.toBeNull();
  await press("Expand PDF"); expect(options().position).toEqual({ page: 6, zoom: 1.25 });
});

it("rejects an earlier inline lifetime after expansion returns to identical HTML", async () => {
  await render(); const old = latest(); await press("Expand PDF"); await press("Close sheet"); const current = latest();
  await act(async () => current.onMessage(position(current, 8, 1.5)));
  await act(async () => { old.onMessage(position(old, 2)); old.onFailure(); });
  expect(container.querySelector("[data-frame]")).not.toBeNull();
  await press("Expand PDF"); expect(options().position).toEqual({ page: 8, zoom: 1.5 });
});

it("ignores a delayed close callback from an earlier sheet lifetime", async () => {
  await render(); await press("Expand PDF"); const oldClose = fixture.closes.at(-1)!;
  await press("Close sheet"); await press("Expand PDF");
  await act(async () => oldClose());
  expect(container.querySelector('[data-frame="full"]')).not.toBeNull();
});
