// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { useSessionSnapshot } from "./session-queries";

const state = vi.hoisted(() => ({
  read: vi.fn(),
  onError: undefined as undefined | ((error: Error) => void),
  close: vi.fn(),
}));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: vi.fn() }));
vi.mock("@/state/queries", () => ({
  hostKey: (machine: string, key: unknown[]) => ["machine", machine, ...key],
  useHostClient: () => client,
  useHostReadActive: () => true,
}));
vi.mock("./wire", () => ({ readSession: state.read, readEarlier: vi.fn(), resolveSync: vi.fn() }));
vi.mock("@/remote/session-sync", () => ({
  watchSessionStream: vi.fn(async (_client: unknown, options: { onError(error: Error): void }) => {
    state.onError = options.onError;
    return { close: state.close };
  }),
}));
const client = {
  machine: { id: "machine", environmentId: "host" },
  endpoint: "https://host",
  supportsStreams: () => true,
  assertCurrentAccess: () => undefined,
  connectionState: () => "ready",
};
const key = ["machine", "machine", "session", "session"];
const blockKey = ["machine", "machine", "session-block", "session", "block", "digest:1"];
const value = { projectId: "visible", revision: 1, status: "idle", session: { id: "session", title: "Closed", blocks: [] } };
let snapshot: ReturnType<typeof useSessionSnapshot>;
let root: ReturnType<typeof createRoot> | undefined;
let cache: QueryClient;
function Probe() {
  snapshot = useSessionSnapshot({ machineId: "machine", sessionId: "session" }, { enabled: true, projectId: "visible" });
  return null;
}
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe))));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  cache?.clear();
  state.read.mockReset();
  state.close.mockReset();
  state.onError = undefined;
  vi.unstubAllGlobals();
});

it("clears the cached transcript and its blocks once the Host closes the session stream as removed", async () => {
  state.read.mockResolvedValueOnce(value);
  await render();
  await vi.waitFor(() => expect(snapshot.data).toEqual(value));
  cache.setQueryData(blockKey, { id: "block", role: "assistant", text: "private" });
  await vi.waitFor(() => expect(state.onError).toBeDefined());
  state.read.mockRejectedValue(new RemoteHostError("machine", "identity", "removed"));
  await act(async () => state.onError!(new RemoteHostError("machine", "identity", "This session or project was removed.")));
  await vi.waitFor(() => expect(cache.getQueryData(key)).toBeUndefined());
  expect(cache.getQueryData(blockKey)).toBeUndefined();
  expect(snapshot.data).toBeUndefined();
});

it("keeps the transcript when the stream only drops (network)", async () => {
  state.read.mockResolvedValue(value);
  await render();
  await vi.waitFor(() => expect(snapshot.data).toEqual(value));
  await vi.waitFor(() => expect(state.onError).toBeDefined());
  await act(async () => state.onError!(new RemoteHostError("machine", "network", "down")));
  expect(cache.getQueryData(key)).toEqual(value);
});
