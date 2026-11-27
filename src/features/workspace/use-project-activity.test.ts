// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";

const state = vi.hoisted(() => ({
  request: vi.fn(), active: true, directoryReady: true, verifying: false, privacyUnavailable: false,
  refetch: vi.fn(),
  streaming: false,
  streamFailed: undefined as ((error: Error) => void) | undefined,
  project: { id: "project", name: "Project", cwd: "/project" },
  machine: { id: "machine", capabilities: [] as string[] },
}));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine }));
vi.mock("@/state/queries", () => {
  const client = { request: state.request, supportsStreams: () => state.streaming };
  return {
    hostKey: (id: string, key: unknown[]) => ["machine", id, ...key],
    useHostClient: () => client,
    useHostReadActive: () => state.active,
  };
});
vi.mock("@/remote/project-stream-hub", () => ({
  retainProjectStream: (_client: unknown, _projectId: string, listener: { onError: (error: Error) => void }) => {
    state.streamFailed = listener.onError;
    return () => { state.streamFailed = undefined; };
  },
}));
vi.mock("./use-project-directory", () => ({ useProjectList: () => ({
  data: state.directoryReady ? [state.project] : undefined,
  directoryReady: state.directoryReady, verifying: state.verifying,
  privacyPending: !state.directoryReady, privacyUnavailable: state.privacyUnavailable,
  readiness: state.directoryReady ? "ready" : state.privacyUnavailable ? "sync-required" : "loading",
  isSuccess: state.directoryReady, isPending: !state.directoryReady,
  isFetching: state.verifying, error: undefined, refetch: state.refetch,
}) }));
import { activityGroupPollDelay, activityPollDelay, UNSTREAMED_GROUP_POLL_MS, useProjectActivity } from "./use-project-activity";

const key = ["machine", "machine", "project-summaries", ["project"]];
const session = { id: "session", projectId: "project", title: "Private session", harness: "codex", revision: 1, status: "idle", updatedAt: 1 };
let cache: QueryClient;
let root: Root;
let result: ReturnType<typeof useProjectActivity>;
function Probe() { result = useProjectActivity(); return null; }
const render = () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe)));
async function load() {
  await act(async () => { render(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(state, { active: true, directoryReady: true, verifying: false, privacyUnavailable: false, streaming: false });
  state.request.mockReset().mockResolvedValue([session]);
  state.refetch.mockReset().mockResolvedValue(undefined);
  focusManager.setFocused(true);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("distinguishes directory verification from a settled desktop sync requirement", async () => {
  state.directoryReady = false; state.verifying = true;
  await load();
  expect(result.pending).toBe(true);
  expect(state.request).not.toHaveBeenCalled();
  state.verifying = false; state.privacyUnavailable = true;
  await act(async () => { render(); });
  expect(result.pending).toBe(false);
  expect(result.privacyUnavailable).toBe(true);
  expect(result.directory).toEqual([]);
});

it("retains ordinary refresh failures and resumes background updates after the network recovers", async () => {
  await load();
  expect(result.directory[0]?.session.id).toBe("session");
  state.request.mockRejectedValue(new RemoteHostError("machine", "network", "Offline"));
  await act(async () => { await cache.invalidateQueries({ queryKey: key }); await vi.advanceTimersByTimeAsync(1); });
  expect(result.directory[0]?.session.id).toBe("session");
  const count = state.request.mock.calls.length;
  state.request.mockResolvedValue([session]);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_001); });
  expect(state.request.mock.calls.length).toBeGreaterThan(count);
  expect(result.error).toBeUndefined();
  expect(result.complete).toBe(true);
});

it("lets the typed fallback read drive recovery after a transient project stream failure", async () => {
  state.streaming = true;
  const timeout = new RemoteHostError("machine", "timeout", "Fallback timed out");
  state.request.mockRejectedValue(timeout);
  await load();
  const streamTimeout = Object.assign(new Error("Stream timed out"), { category: "deadline" });
  await act(async () => state.streamFailed?.(streamTimeout));
  expect(result.error).toBe(timeout);

  state.request.mockResolvedValue([session]);
  await act(async () => { await result.refetch(); await vi.advanceTimersByTimeAsync(1); });
  expect(result.error).toBeUndefined();
  expect(result.directory).toHaveLength(1);
});

it.each(["auth", "identity"] as const)("conceals cached session rows after %s failure", async (kind) => {
  await load();
  expect(result.directory).toHaveLength(1);
  const error = new RemoteHostError("machine", kind, "Access changed");
  state.request.mockRejectedValue(error);
  await act(async () => { await cache.invalidateQueries({ queryKey: key }); await vi.advanceTimersByTimeAsync(1); });
  expect(result.directory).toEqual([]);
  expect(result.sessions).toEqual([]);
  expect(result.error).toBe(error);
  const count = state.request.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(state.request).toHaveBeenCalledTimes(count);
});

it("does not re-render a hidden consumer on cache writes and reads the latest data on return", async () => {
  await load();
  let renders = 0;
  const counted = () => { renders += 1; result = useProjectActivity(); return null; };
  state.active = false;
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache }, createElement(counted))); });
  renders = 0;
  const later = { ...session, title: "Renamed", revision: 2, updatedAt: 2 };
  await act(async () => {
    cache.setQueryData(key, (previous: { projects: Record<string, unknown> } | undefined) => ({
      ...previous, projects: { ...previous?.projects, project: { sessions: [later] } },
    }));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(renders).toBe(0);
  state.active = true;
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache }, createElement(counted))); });
  expect(cache.getQueryData<{ projects: Record<string, unknown> }>(key)?.projects.project).toEqual({ sessions: [later] });
  expect(renders).toBeGreaterThan(0);
});

it("backs off summary polling 5s to 60s and resets after success", () => {
  expect([0, 1, 2, 3, 4, 5, 9].map(activityPollDelay)).toEqual([5_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
});

it("slows unstreamed summary groups only while the stream is healthy", () => {
  expect(activityGroupPollDelay(0, false)).toBe(activityPollDelay(0));
  expect(activityGroupPollDelay(0, true)).toBe(UNSTREAMED_GROUP_POLL_MS);
  expect(activityGroupPollDelay(5, true)).toBe(activityPollDelay(5));
});
