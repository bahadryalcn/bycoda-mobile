// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider, type QueryObserverOptions } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSessionBlock, useSessionSnapshot } from "./session-queries";
const state = vi.hoisted(() => ({ allowed: true, read: vi.fn(), request: vi.fn(), resolveSync: vi.fn() }));
vi.mock("@/state/queries", () => ({ hostKey: (machine: string, key: unknown[]) => ["machine", machine, ...key], useHostClient: () => ({ machine: { id: "machine" }, request: state.request }), useHostReadActive: () => true }));
vi.mock("./wire", () => ({ readSession: state.read, readEarlier: vi.fn(), resolveSync: state.resolveSync }));
let snapshot: ReturnType<typeof useSessionSnapshot>; let root: ReturnType<typeof createRoot> | undefined; let cache: QueryClient;
let block: ReturnType<typeof useSessionBlock>;
const key = ["machine", "machine", "session", "session"]; const value = (projectId = "visible") => ({ projectId, revision: 1, status: "idle", session: { id: "session", title: "Private", blocks: [] } });
function Probe() { snapshot = useSessionSnapshot({ machineId: "machine", sessionId: "session" }, { enabled: true, projectId: "visible", canRead: () => state.allowed }); return null; }
function BlockProbe() { block = useSessionBlock({ scope: { machineId: "machine", sessionId: "session" }, blockId: "block", revision: 1, enabled: true }); return null; }
async function render(probe = Probe) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); cache ??= new QueryClient({ defaultOptions: { queries: { retry: false } } }); root = createRoot(document.createElement("div")); await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(probe)))); }
beforeEach(() => notifyManager.setNotifyFunction((notify) => { act(notify); }));
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; cache?.clear(); cache = undefined as never; state.allowed = true; state.read.mockReset(); state.request.mockReset(); state.resolveSync.mockReset(); notifyManager.setNotifyFunction((notify) => notify()); vi.unstubAllGlobals(); });
it("does not fetch or cache a transcript without current project visibility proof", async () => {
  state.allowed = false; await render(); await vi.waitFor(() => expect(snapshot.isError).toBe(true)); expect(state.read).not.toHaveBeenCalled(); expect(cache.getQueryData(key)).toBeUndefined();
});
it("refuses a wrong-project response before cache commit", async () => {
  state.read.mockResolvedValue(value("hidden")); await render(); await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  expect(snapshot.error).toMatchObject({ kind: "identity" }); expect(snapshot.data).toBeUndefined(); expect(cache.getQueryData(key)).toBeUndefined();
});
it("rechecks visibility after an in-flight read and permits explicit recovery after fresh proof", async () => {
  let finish!: (result: unknown) => void; state.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })); await render();
  state.allowed = false; await act(async () => finish(value())); await vi.waitFor(() => expect(snapshot.isError).toBe(true)); expect(cache.getQueryData(key)).toBeUndefined();
  state.allowed = true; state.read.mockResolvedValue(value()); await act(async () => { await snapshot.refetch(); }); await vi.waitFor(() => expect(snapshot.data).toEqual(value()));
});
it("an authenticated-access failure conceals previously cached content instead of treating it as an ordinary refresh", async () => {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); cache.setQueryData(key, value(), { updatedAt: 1 }); state.read.mockRejectedValue({ kind: "auth" });
  await render(); await vi.waitFor(() => expect(snapshot.isError).toBe(true)); expect(snapshot.data).toBeUndefined();
  expect(cache.getQueryData(key)).toEqual(value()); // Memory retention is not UI permission or a second draft owner.
});
it.each(["auth", "identity", "unsupported"])("stops automatic snapshot polling after a terminal %s failure", async (kind) => {
  state.read.mockRejectedValue({ kind }); await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  const query = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  const interval = (query.options as QueryObserverOptions).refetchInterval;
  expect(typeof interval).toBe("function");
  if (typeof interval === "function") expect(interval(query)).toBe(false);
});
it("keeps ordinary connection failures retryable through the normal snapshot poll", async () => {
  state.read.mockRejectedValue({ kind: "network" }); await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  const query = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  const interval = (query.options as QueryObserverOptions).refetchInterval;
  if (typeof interval === "function") expect(interval(query)).toBe(7_500);
  else throw new Error("Missing snapshot polling policy");
});
it("does not cache a block from another session even if its block ID matches", async () => {
  state.request.mockResolvedValue({});
  state.resolveSync.mockResolvedValue({ kind: "snapshot", value: { session: { id: "other", blocks: [{ id: "block" }] } } });
  await render(BlockProbe); await vi.waitFor(() => expect(block.isError).toBe(true));
  expect(block.error).toMatchObject({ kind: "identity" });
  expect(cache.getQueryData(["machine", "machine", "session-block", "session", "block", 1])).toBeUndefined();
});
