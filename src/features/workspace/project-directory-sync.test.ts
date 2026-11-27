// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectDirectory } from "./use-project-directory";
import { invalidateProjectPrivacy, projectPrivacyKey, projectVisibilityExpired } from "./project-privacy-cache";

const state = vi.hoisted(() => ({
  machine: { id: "machine", environmentId: "host", capabilities: ["projects.directory.v1", "projects.directory.stream.v1"] as string[] },
  client: undefined as any,
  intervals: [] as unknown[],
  rpc: vi.fn(),
}));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  return { useActiveMachine: () => state.machine, useMachines: create(() => ({ machines: [state.machine], activeId: "machine", hydrated: true, storageError: null, connectionPending: false })) };
});
vi.mock("@/state/security", async () => {
  const { create } = await import("zustand");
  return { useSecurity: create(() => ({ status: "unlocked", appState: "active", windowFocused: true })), isAppContentVisible: () => true, isAppContentRetained: () => true };
});
vi.mock("../privacy/consent-access", () => ({ hasProviderPermission: () => true }));
vi.mock("@/state/queries", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    hostKey: (id: string, key: unknown[]) => ["machine", id, ...key],
    useHostReadActive: () => true,
    useHostClient: () => state.client,
    useHostQuery: (key: unknown[], method: string, params: unknown, options: { enabled: boolean; interval: unknown; queryFn?: (c: unknown, s: AbortSignal) => Promise<unknown> }) => {
      state.intervals.push(typeof options.interval === "function" ? options.interval(undefined) : options.interval);
      return useQuery({
        queryKey: ["machine", "machine", ...key, { method, params }],
        queryFn: ({ signal }) => options.queryFn!(state.client, signal),
        enabled: options.enabled, staleTime: Infinity, retry: false,
      });
    },
  };
});

type Opened = { apply: (event: any, assertCurrent: () => void) => Promise<unknown>; onError: (e: Error) => void; close: ReturnType<typeof vi.fn> };
const directory = (ids: string[]) => ({ version: 1, privacyReady: true, groups: [], projects: ids.map((id) => ({ id, cwd: `/${id}`, name: id, registered: true })) });
const event = (ids: string[], sequence: number) => ({ params: { subscriptionId: "s", streamId: "x", cursor: { epoch: "e", sequence }, kind: "snapshot", data: { projects: [], directory: directory(ids) } } });
function makeClient(capabilities: string[]) {
  const opened: Opened[] = [];
  const client = {
    machine: { ...state.machine, capabilities },
    supportsStreams: () => true,
    assertCurrentAccess: () => undefined,
    request: state.rpc,
    observeStream: vi.fn(async (_target: unknown, apply: Opened["apply"], onError: Opened["onError"]) => {
      const close = vi.fn(); opened.push({ apply, onError, close }); return { close };
    }),
  };
  return { client, opened };
}
let results: ReturnType<typeof useProjectDirectory>[] = []; let root: ReturnType<typeof createRoot> | undefined; let cache: QueryClient;
function Probe({ index }: { index: number }) { results[index] = useProjectDirectory(); return null; }
async function render(count = 1) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache = new QueryClient(); root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, ...Array.from({ length: count }, (_, i) => createElement(Probe, { index: i, key: i })))));
}
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; cache?.clear(); results = []; state.intervals = []; state.rpc.mockReset(); vi.unstubAllGlobals();
});
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const lastInterval = () => state.intervals.at(-1);
const names = (i = 0) => results[i]!.projects.map((project) => project.id);

it("many callers share one stream; the stream replaces the poll and deletions reach every caller", async () => {
  const fixture = makeClient(["transport.ws.streams.v2", "projects.directory.stream.v1", "projects.directory.v1"]);
  state.client = fixture.client; state.rpc.mockResolvedValue(directory(["rpc"]));
  await render(3);
  expect(fixture.client.observeStream).toHaveBeenCalledTimes(1);
  expect(results[0]!.sync).toBe("catching-up");
  await act(async () => { await fixture.opened[0]!.apply(event(["a", "b"], 1), () => undefined); });
  expect(results.map((r) => r.sync)).toEqual(["live", "live", "live"]);
  expect(lastInterval()).toBe(false);
  expect(names(0)).toEqual(["a", "b"]); expect(names(2)).toEqual(["a", "b"]);
  await act(async () => { await fixture.opened[0]!.apply(event(["b"], 2), () => undefined); });
  await flush();
  expect(names(1)).toEqual(["b"]);
  await act(async () => root?.unmount()); root = undefined;
  expect(fixture.opened[0]!.close).toHaveBeenCalledTimes(1);
});

it("a slower RPC refresh cannot overwrite a newer stream snapshot", async () => {
  const fixture = makeClient(["transport.ws.streams.v2", "projects.directory.stream.v1", "projects.directory.v1"]);
  state.client = fixture.client;
  let finish!: (value: unknown) => void;
  state.rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => { await fixture.opened[0]!.apply(event(["fresh"], 1), () => undefined); });
  await act(async () => { finish(directory(["stale", "gone"])); await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(cache.getQueryData(projectPrivacyKey("machine", true))).toEqual(directory(["fresh"]));
  expect(names()).toEqual(["fresh"]);
  // Manual refresh still works and its newer result lands.
  state.rpc.mockResolvedValue(directory(["manual"]));
  await act(async () => { await results[0]!.query.refetch(); });
  await flush();
  expect(names()).toEqual(["manual"]);
});

it("polls while the stream is stale or the Host cannot stream", async () => {
  const fixture = makeClient(["transport.ws.streams.v2", "projects.directory.stream.v1", "projects.directory.v1"]);
  state.client = fixture.client; state.rpc.mockResolvedValue(directory(["rpc"]));
  await render();
  await act(async () => { await fixture.opened[0]!.apply(event(["a"], 1), () => undefined); });
  expect(lastInterval()).toBe(false);
  await act(async () => { fixture.opened[0]!.onError(Object.assign(new Error("down"), { kind: "network" })); });
  expect(results[0]!.sync).toBe("stale");
  expect(lastInterval()).toBe(15_000);
  await act(async () => root?.unmount()); root = undefined; cache.clear();
  const plain = makeClient(["projects.directory.v1"]);
  state.client = plain.client; state.intervals = [];
  await render();
  expect(plain.client.observeStream).not.toHaveBeenCalled();
  expect(results[0]!.sync).toBe("polling");
  expect(lastInterval()).toBe(15_000);
});

it("does not restore expired privacy proof from a late stream snapshot", async () => {
  const fixture = makeClient(["transport.ws.streams.v2", "projects.directory.stream.v1", "projects.directory.v1"]);
  state.client = fixture.client;
  state.rpc.mockResolvedValue(directory(["private"]));
  await render();
  await flush();
  const key = projectPrivacyKey("machine", true);
  await act(async () => { await invalidateProjectPrivacy(cache, "machine"); });
  expect(projectVisibilityExpired(cache, key)).toBe(true);
  await act(async () => { await fixture.opened[0]!.apply(event(["private"], 2), () => undefined); });
  expect(projectVisibilityExpired(cache, key)).toBe(true);
  expect(names()).toEqual([]);
});
