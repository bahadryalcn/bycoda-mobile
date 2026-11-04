// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PrivateContentAccessProvider } from "./private-access";
import { ProjectMediaContent } from "./project-media-content";
import type { MessageContext } from "./media-policy";

const s = vi.hoisted(() => {
  const machine = { id: "machine", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic" };
  return { machine, client: { machine, request: vi.fn(async () => "read") }, active: true, allowed: true, epoch: 0,
    kind: "success", uri: "file:///first.png", loads: 0, pending: [] as ((value: any) => void)[],
    props: null as any, retry: undefined as undefined | (() => void), opens: [] as any[] };
});
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("./tokens", () => ({ space: {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: s.machine.id, machines: [s.machine] }) } }));
vi.mock("@/state/connection-scope", () => { const epochs = new Map<number, any>(); return { useConnectionScope: () => {
  const epoch = s.epoch; if (!epochs.has(epoch)) epochs.set(epoch, { isCurrent: () => s.epoch === epoch }); return epochs.get(epoch);
} }; });
vi.mock("@/state/queries", async () => {
  const { usePrivateContentAccess } = await import("./private-access"), { useMemo } = await import("react");
  return { useHostReadActive: () => s.active, useHostClient: () => { const access = usePrivateContentAccess();
    return useMemo(() => access.allowed && access.check() ? { ...s.client, request: async (...args: any[]) => {
      if (!access.check()) throw Error("retired"); return (s.client.request as any)(...args);
    } } : null, [access]);
  } };
});
vi.mock("./media-loader", () => ({ loadProjectMedia: async () => {
  s.loads++; if (s.kind === "hold") return new Promise(resolve => s.pending.push(resolve));
  if (s.kind !== "success") throw Object.assign(Error(s.kind), { kind: s.kind });
  return { uri: s.uri, name: "image.png", mimeType: "image/png" };
} }));
vi.mock("./document-content", () => ({ DocumentContent: (props: any) => { s.props = props; return h("div", { "data-media": true }, props.uri); } }));
vi.mock("./document-navigation", () => ({ DocumentNavigation: ({ children }: any) => children((...args: any[]) => s.opens.push(args)) }));
vi.mock("./primitives", () => ({ Loading: () => null, Notice: ({ message }: any) => h("p", null, message),
  ErrorText: ({ error }: any) => error ? h("p", null, error.message) : null,
  Button: ({ label, onPress, busy }: any) => { s.retry = onPress; return h("button", { onClick: onPress, disabled: busy }, label); },
}));

let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement, cache: QueryClient;
let shown = true, path = "image.png";
let context = { client: s.client, machineId: "machine", projectId: "project", sessionId: "session", cwd: "/project" } as unknown as MessageContext;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
async function render() {
  if (!root) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
  await act(async () => root!.render(h(QueryClientProvider, { client: cache }, h(PrivateContentAccessProvider,
    { value: { allowed: s.allowed, check: () => s.allowed } }, shown ? h(ProjectMediaContent, { path, context }) : null)))); await flush();
}
async function refresh() { await act(async () => { await cache.getQueryCache().getAll()[0].fetch().catch(() => {}); }); await flush(); }
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; cache?.clear(); vi.unstubAllGlobals();
  shown = true; path = "image.png"; s.active = s.allowed = true; s.epoch = 0; s.kind = "success";
  s.uri = "file:///first.png"; s.loads = 0; s.pending = []; s.opens = []; s.props = null; s.retry = undefined;
  context = { ...context, client: s.client, projectId: "project" } as unknown as MessageContext; s.client.request.mockClear();
});

it("retires descendant transport, reload and navigation when unmounted", async () => {
  await render(); const old = s.props; shown = false; await render();
  await act(async () => { old.onReload(); old.onOpenFile("child.txt", old.context); }); await flush();
  await expect(old.context.client.request("workspace.run", {})).rejects.toThrow("retired");
  expect(s.loads).toBe(1); expect(s.opens).toHaveLength(0);
});
it("holds denied cached media through network failure and reopen until fresh success", async () => {
  await render(); expect(container.textContent).toContain(s.uri); s.kind = "auth"; await refresh();
  expect(container.querySelector("[data-media]")).toBeNull(); s.kind = "network"; await refresh();
  shown = false; await render(); shown = true; await render(); expect(container.querySelector("[data-media]")).toBeNull();
  s.kind = "success"; await act(async () => s.retry!()); await flush(); expect(container.textContent).toContain(s.uri);
});
it("rejects callbacks for replaced bytes and contexts from another project", async () => {
  await render(); const old = s.props; s.uri = "file:///second.png"; await refresh();
  await act(async () => { old.onReload(); old.onOpenFile("child.txt", old.context);
    s.props.onOpenFile("child.txt", { ...s.props.context, projectId: "other" }); }); await flush();
  expect(s.loads).toBe(2); expect(s.opens).toHaveLength(0);
  await act(async () => s.props.onOpenFile("child.txt", s.props.context)); expect(s.opens).toHaveLength(1);
});
it.each(["background", "private"])("retires old content callbacks after %s access returns", async kind => {
  await render(); const old = s.props; if (kind === "background") s.active = false; else s.allowed = false;
  await render(); expect(container.querySelector("[data-media]")).toBeNull(); s.active = s.allowed = true; await render();
  const loadsAfterReturn = s.loads;
  await act(async () => { old.onReload(); old.onOpenFile("child.txt", old.context); }); await flush();
  expect(s.loads).toBe(loadsAfterReturn); expect(s.opens).toHaveLength(0); expect(container.textContent).toContain(s.uri);
});
it("rejects epoch-retired reads before React commits", async () => {
  await render(); const old = s.props; s.epoch++;
  await act(async () => { old.onReload(); old.onOpenFile("child.txt", old.context); }); await refresh();
  expect(s.loads).toBe(1); expect(s.opens).toHaveLength(0);
});
it("ignores a pending result after unmount and coalesces reloads", async () => {
  await render(); s.kind = "hold"; const reload = s.props.onReload;
  await act(async () => { reload(); reload(); }); await flush(); expect(s.loads).toBe(2);
  shown = false; await render(); await act(async () => s.pending[0]({ uri: "file:///late.png", name: "image.png", mimeType: "image/png" })); await flush();
  expect(cache.getQueryCache().getAll().some(query => (query.state.data as any)?.uri === "file:///late.png")).toBe(false);
});
it("follows a new inline resource while retiring the old callbacks", async () => {
  await render(); const old = s.props; path = "next.png"; s.uri = "file:///next.png"; await render();
  await act(async () => { old.onReload(); old.onOpenFile("child.txt", old.context); }); await flush();
  expect(s.loads).toBe(2); expect(s.opens).toHaveLength(0); expect(container.textContent).toContain(s.uri);
});
