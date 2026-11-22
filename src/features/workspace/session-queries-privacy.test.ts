// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
  type QueryObserverOptions,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEarlierSession, useSessionBlock, useSessionSnapshot } from "./session-queries";
import type { HostSession } from "./wire";
const state = vi.hoisted(() => ({
  allowed: true,
  active: true,
  connection: 1,
  restoreBefore: undefined as number | undefined,
  read: vi.fn(),
  earlier: vi.fn(),
  request: vi.fn(),
  resolveSync: vi.fn(),
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const connection = state.connection;
    return { token: String(connection), isCurrent: () => connection === state.connection };
  },
}));
vi.mock("@/state/queries", () => {
  const client = { machine: { id: "machine" }, request: state.request, assertCurrentAccess: () => {} };
  return {
    hostKey: (machine: string, key: unknown[]) => ["machine", machine, ...key],
    useHostClient: () => client,
    useHostReadActive: () => state.active,
  };
});
vi.mock("./wire", () => ({
  readSession: state.read,
  readEarlier: state.earlier,
  resolveSync: state.resolveSync,
}));
let snapshot: ReturnType<typeof useSessionSnapshot>;
let root: ReturnType<typeof createRoot> | undefined;
let cache: QueryClient;
let block: ReturnType<typeof useSessionBlock>;
let earlier: ReturnType<typeof useEarlierSession>;
const key = ["machine", "machine", "session", "session"];
const value = (projectId = "visible"): HostSession => ({
  projectId,
  revision: 1,
  status: "idle",
  updatedAt: 1,
  session: {
    id: "session", title: "Private", blocks: [], cwd: "/repo", harness: "codex",
    model: "codex:model", modelSettings: {}, runtimeMode: "supervised",
  },
});
function Probe() {
  snapshot = useSessionSnapshot(
    { machineId: "machine", sessionId: "session" },
    {
      enabled: true,
      projectId: "visible",
      canRead: () => state.allowed,
      restoreBefore: () => state.restoreBefore,
    },
  );
  return null;
}
function BlockProbe() {
  block = useSessionBlock({
    scope: { machineId: "machine", sessionId: "session" },
    blockId: "block",
    getRevision: () => 1,
    enabled: true,
  });
  return null;
}
const historyPage = (before: number) => ({
  ...value(),
  history: { before, revision: 1, totalBlocks: 100 },
});
function EarlierProbe() {
  earlier = useEarlierSession({ machineId: "machine", sessionId: "session" }, historyPage(80));
  return null;
}
async function render(probe = Probe) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement("div"));
  await act(async () =>
    root!.render(createElement(QueryClientProvider, { client: cache }, createElement(probe))),
  );
}
beforeEach(() =>
  notifyManager.setNotifyFunction((notify) => {
    act(notify);
  }),
);
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  cache?.clear();
  cache = undefined as never;
  state.allowed = true;
  state.active = true;
  state.connection = 1;
  state.restoreBefore = undefined;
  state.read.mockReset();
  state.earlier.mockReset();
  state.request.mockReset();
  state.resolveSync.mockReset();
  notifyManager.setNotifyFunction((notify) => notify());
  vi.unstubAllGlobals();
});

it("keeps history already paged further at the same transcript revision", async () => {
  const delayed = Promise.withResolvers<ReturnType<typeof historyPage>>();
  state.earlier.mockReturnValueOnce(delayed.promise);
  await render(EarlierProbe);
  cache.setQueryData(key, historyPage(80));
  let request!: Promise<unknown>;
  await act(async () => { request = earlier.mutateAsync(); });
  await vi.waitFor(() => expect(state.earlier).toHaveBeenCalledOnce());
  const progressed = historyPage(20);
  cache.setQueryData(key, progressed, { updatedAt: 123 });
  await act(async () => { delayed.resolve(historyPage(40)); await request; });
  expect(cache.getQueryData(key)).toEqual(progressed);
  expect(cache.getQueryState(key)?.dataUpdatedAt).toBe(123);
});

it("only loads the displayed cursor and retains its verified earlier page", async () => {
  const loaded = historyPage(40);
  state.earlier.mockResolvedValueOnce(loaded);
  await render(EarlierProbe);
  cache.setQueryData(key, historyPage(80));
  await act(async () => { await earlier.mutateAsync(); await earlier.mutateAsync(); });
  expect(state.earlier).toHaveBeenCalledOnce();
  expect(cache.getQueryData(key)).toEqual(loaded);
});

it("does not publish in-flight history from a retired connection with the same saved row", async () => {
  const delayed = Promise.withResolvers<ReturnType<typeof historyPage>>();
  state.earlier.mockReturnValueOnce(delayed.promise);
  await render(EarlierProbe);
  cache.setQueryData(key, historyPage(80));
  let request!: Promise<unknown>;
  await act(async () => { request = earlier.mutateAsync(); });
  await vi.waitFor(() => expect(state.earlier).toHaveBeenCalledOnce());
  state.connection++;
  const replacement = historyPage(80);
  cache.setQueryData(key, replacement, { updatedAt: 123 });
  await act(async () => { delayed.resolve(historyPage(40)); await request; });
  expect(cache.getQueryData(key)).toEqual(replacement);
  expect(cache.getQueryState(key)?.dataUpdatedAt).toBe(123);
});

it("detaches an inactive route's payload observer and releases an oversized cache", async () => {
  const large = {
    ...value(),
    session: { ...value().session, blocks: [{ id: "large", text: "x".repeat(5 * 1024 * 1024) }] },
  };
  state.read.mockResolvedValue(large);
  await render();
  await vi.waitFor(() => expect(snapshot.data).toEqual(large));
  state.active = false;
  await act(async () =>
    root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe))),
  );
  await vi.waitFor(() => expect(cache.getQueryData(key)).toBeUndefined());
  expect(snapshot.parked).toBe(true);
  expect(snapshot.data).toBeUndefined();
});

it("rehydrates the previous history cursor before publishing a restored transcript", async () => {
  state.restoreBefore = 20;
  const page = (before: number) => ({
    ...value(),
    history: { before, revision: 1, totalBlocks: 100 },
  });
  let finish!: (result: unknown) => void;
  state.read.mockResolvedValue(page(80));
  state.earlier.mockResolvedValueOnce(page(40)).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await vi.waitFor(() => expect(state.earlier).toHaveBeenCalledTimes(2));
  expect(snapshot.data).toBeUndefined();
  await act(async () => finish(page(20)));
  await vi.waitFor(() => expect(snapshot.data?.history?.before).toBe(20));
});

it("does not commit stale restore pages after route focus changes", async () => {
  state.restoreBefore = 20;
  const page = (before: number) => ({
    ...value(),
    history: { before, revision: 1, totalBlocks: 100 },
  });
  let finish!: (result: unknown) => void;
  state.read.mockResolvedValue(page(80));
  state.earlier.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await vi.waitFor(() => expect(state.earlier).toHaveBeenCalled());
  state.active = false;
  await act(async () =>
    root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe))),
  );
  await act(async () => finish(page(20)));
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(snapshot.data).toBeUndefined();
});
it("does not fetch or cache a transcript without current project visibility proof", async () => {
  state.allowed = false;
  await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  expect(state.read).not.toHaveBeenCalled();
  expect(cache.getQueryData(key)).toBeUndefined();
});
it("refuses a wrong-project response before cache commit", async () => {
  state.read.mockResolvedValue(value("hidden"));
  await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  expect(snapshot.error).toMatchObject({
    sessionId: "session",
    expectedProjectId: "visible",
    actualProjectId: "hidden",
  });
  expect(snapshot.error).not.toHaveProperty("kind", "identity");
  expect(snapshot.data).toBeUndefined();
  expect(cache.getQueryData(key)).toBeUndefined();
});
it("rechecks visibility after an in-flight read and permits explicit recovery after fresh proof", async () => {
  let finish!: (result: unknown) => void;
  state.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  state.allowed = false;
  await act(async () => finish(value()));
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  expect(cache.getQueryData(key)).toBeUndefined();
  state.allowed = true;
  state.read.mockResolvedValue(value());
  await act(async () => {
    await snapshot.refetch();
  });
  await vi.waitFor(() => expect(snapshot.data).toEqual(value()));
});
it("an authenticated-access failure conceals previously cached content instead of treating it as an ordinary refresh", async () => {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(key, value(), { updatedAt: 1 });
  state.read.mockRejectedValue({ kind: "auth" });
  await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  expect(snapshot.data).toBeUndefined();
  expect(cache.getQueryData(key)).toEqual(value()); // Memory retention is not UI permission or a second draft owner.
});
it.each(["auth", "identity", "unsupported"])(
  "stops automatic snapshot polling after a terminal %s failure",
  async (kind) => {
    state.read.mockRejectedValue({ kind });
    await render();
    await vi.waitFor(() => expect(snapshot.isError).toBe(true));
    const query = cache.getQueryCache().find({ queryKey: key, exact: true })!;
    const interval = (query.options as QueryObserverOptions).refetchInterval;
    expect(typeof interval).toBe("function");
    if (typeof interval === "function") expect(interval(query)).toBe(false);
  },
);
it("keeps initial connection failures retryable without racing the visible retry", async () => {
  state.read.mockRejectedValue({ kind: "network" });
  await render();
  await vi.waitFor(() => expect(snapshot.isError).toBe(true));
  const query = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  const interval = (query.options as QueryObserverOptions).refetchInterval;
  if (typeof interval === "function") expect(interval(query)).toBe(30_000);
  else throw new Error("Missing snapshot polling policy");
});
it("does not cache a block from another session even if its block ID matches", async () => {
  state.request.mockResolvedValue({});
  state.resolveSync.mockResolvedValue({
    kind: "snapshot",
    value: { session: { id: "other", blocks: [{ id: "block" }] } },
  });
  await render(BlockProbe);
  await vi.waitFor(() => expect(block.isError).toBe(true));
  expect(block.error).toMatchObject({ kind: "identity" });
  expect(
    cache.getQueryData(["machine", "machine", "session-block", "session", "block", 1]),
  ).toBeUndefined();
});
