import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { HostTransport } from "@/remote/host-transport";
import { RemoteHostError } from "@/remote/host-error";
import {
  directoryReadFence,
  directorySyncState,
  retainDirectorySync,
  subscribeDirectorySync,
  supportsDirectoryStream,
} from "./directory-sync";

type Apply = (event: any, assertCurrent: () => void) => Promise<boolean | "resync">;
type Opened = {
  apply: Apply;
  onError: (error: Error) => void;
  onPhase: (phase: "catching-up" | "live") => void;
  close: ReturnType<typeof vi.fn>;
};

const key = ["machine", "m1", "projects", "directory", { method: "projects.directory", params: {} }];
const project = (id: string) => ({ id, cwd: `/${id}`, name: id.toUpperCase(), registered: true });
const directory = (ids: string[], privacyReady = true) => ({
  version: 1 as const,
  privacyReady,
  groups: [],
  projects: ids.map(project),
});
const snapshot = (data: unknown, sequence = 1) => ({
  jsonrpc: "2.0",
  method: "subscription.event",
  params: {
    subscriptionId: "s",
    streamId: "stream",
    cursor: { epoch: "e", sequence },
    kind: "snapshot",
    data,
  },
});
const event = (ids: string[], sequence = 1, privacyReady = true) =>
  snapshot({ projects: ids.map((id) => ({ id })), directory: directory(ids, privacyReady) }, sequence);

function fakeClient(options: { capabilities?: string[]; open?: () => Promise<unknown> } = {}) {
  const opened: Opened[] = [];
  const client = {
    endpoint: "https://host.example",
    machine: {
      id: "m1",
      environmentId: "environment",
      capabilities: options.capabilities ?? ["transport.ws.streams.v2", "projects.directory.stream.v1"],
    },
    supportsStreams: () => true,
    assertCurrentAccess: vi.fn(),
    observeStream: vi.fn(async (target: unknown, apply: Apply, onError: any, onPhase: any) => {
      expect(target).toEqual({ kind: "environment" });
      if (options.open) await options.open();
      const close = vi.fn();
      opened.push({ apply, onError, onPhase, close });
      return { close };
    }),
  };
  return { client: client as unknown as HostTransport, raw: client, opened };
}

let cache: QueryClient;
beforeEach(() => {
  cache = new QueryClient();
});
afterEach(() => {
  cache.clear();
  vi.useRealTimers();
});
const retain = (client: HostTransport, canApply = () => true) =>
  retainDirectorySync(cache, client, { key, canApply });
const current = () => undefined;
const names = () => (cache.getQueryData<any>(key)?.projects ?? []).map((row: any) => row.id);

it("writes the initial directory snapshot, groups and privacy proof included", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  expect(directorySyncState(cache, client)).toBe("catching-up");
  await expect(opened[0]!.apply(event(["a", "b"]), current)).resolves.toBe(true);
  expect(cache.getQueryData(key)).toEqual(directory(["a", "b"]));
  expect(directorySyncState(cache, client)).toBe("live");
  release();
});

it("replaces the cache on update and honors removals instead of merging", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await opened[0]!.apply(event(["a", "b"], 1), current);
  await opened[0]!.apply(event(["b"], 2), current);
  expect(names()).toEqual(["b"]);
  await opened[0]!.apply(event(["b"], 3, false), current);
  expect(cache.getQueryData<any>(key)).toMatchObject({ privacyReady: false });
  release();
});

it("asks for a fresh snapshot instead of applying deltas or unknown kinds", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  const delta = { ...event(["a"]), params: { ...event(["a"]).params, kind: "delta" } };
  await expect(opened[0]!.apply(delta, current)).resolves.toBe("resync");
  expect(cache.getQueryData(key)).toBeUndefined();
  release();
});

it("rejects malformed optional layout data before it reaches the cache", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  const invalid = { ...directory(["a"]), projects: [{ ...project("a"), sessionLayout: { folders: "invalid" } }] };
  await expect(opened[0]!.apply(snapshot({ directory: invalid }), current)).rejects.toThrow("invalid directory");
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(directorySyncState(cache, client)).toBe("polling");
  release();
});

it("shares distinct hook transports for one computer and transfers ownership on release", async () => {
  const first = fakeClient();
  const second = fakeClient();
  const releaseFirst = retain(first.client);
  const releaseSecond = retain(second.client);
  await vi.waitFor(() => expect(first.opened).toHaveLength(1));
  expect(second.raw.observeStream).not.toHaveBeenCalled();
  await first.opened[0]!.apply(event(["a"]), current);
  expect(directorySyncState(cache, second.client)).toBe("live");
  releaseFirst();
  await vi.waitFor(() => expect(second.opened).toHaveLength(1));
  expect(first.opened[0]!.close).toHaveBeenCalledTimes(1);
  expect(await first.opened[0]!.apply(event(["old"]), current)).toBe(false);
  await second.opened[0]!.apply(event(["new"]), current);
  expect(names()).toEqual(["new"]);
  releaseSecond();
});

it("keeps a re-paired environment separate even when its machine ID is reused", async () => {
  const first = fakeClient();
  const second = fakeClient();
  second.raw.machine.environmentId = "replacement";
  const releaseFirst = retain(first.client);
  const releaseSecond = retain(second.client);
  await vi.waitFor(() => expect(first.opened).toHaveLength(1));
  expect(second.opened).toHaveLength(1);
  await first.opened[0]!.apply(event(["a"]), current);
  expect(directorySyncState(cache, second.client)).toBe("catching-up");
  releaseFirst();
  releaseSecond();
});

it("reports catching-up while the transport resyncs and stale while it is disconnected", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await opened[0]!.apply(event(["a"]), current);
  opened[0]!.onPhase("catching-up");
  expect(directorySyncState(cache, client)).toBe("catching-up");
  opened[0]!.onError(new RemoteHostError("m1", "network", "down"));
  expect(directorySyncState(cache, client)).toBe("stale");
  opened[0]!.onPhase("catching-up");
  expect(directorySyncState(cache, client)).toBe("stale");
  await opened[0]!.apply(event(["a"], 2), current);
  expect(directorySyncState(cache, client)).toBe("live");
  release();
});

it("notifies state subscribers and stops after unsubscribe", async () => {
  const { client, opened } = fakeClient();
  const notify = vi.fn();
  const stop = subscribeDirectorySync(cache, client, notify);
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await opened[0]!.apply(event(["a"]), current);
  expect(notify).toHaveBeenCalled();
  stop();
  notify.mockClear();
  opened[0]!.onError(new RemoteHostError("m1", "network", "down"));
  expect(notify).not.toHaveBeenCalled();
  release();
});

it("never writes for a cancelled, released or superseded delivery", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  const cancelled = () => {
    throw new Error("cancelled");
  };
  await expect(opened[0]!.apply(event(["old"]), cancelled)).rejects.toThrow("cancelled");
  expect(cache.getQueryData(key)).toBeUndefined();
  // A delivery that was already decoding when the last consumer left stays unwritten.
  const late = opened[0]!.apply(event(["late"]), current);
  release();
  await late;
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(opened[0]!.close).toHaveBeenCalled();
});

it("drops a snapshot when the access check fails mid-delivery", async () => {
  const { client, opened, raw } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  raw.assertCurrentAccess.mockImplementation(() => {
    throw new RemoteHostError("m1", "auth", "locked");
  });
  await expect(opened[0]!.apply(event(["a"]), current)).rejects.toThrow("locked");
  expect(cache.getQueryData(key)).toBeUndefined();
  release();
});

it("does not revive projects while privacy or consent forbids it, and recovers with a fresh stream", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const { client, opened } = fakeClient();
  let allowed = false;
  const release = retain(client, () => allowed);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await expect(opened[0]!.apply(event(["secret"]), current)).resolves.toBe(false);
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(opened[0]!.close).toHaveBeenCalledTimes(1);
  expect(directorySyncState(cache, client)).toBe("stale");
  allowed = true;
  await vi.advanceTimersByTimeAsync(31_000);
  await vi.waitFor(() => expect(opened).toHaveLength(2));
  await opened[1]!.apply(event(["visible"], 1), current);
  expect(names()).toEqual(["visible"]);
  release();
});

it("opens one Host stream for any number of consumers and closes with the last", async () => {
  const { client, raw, opened } = fakeClient();
  const releases = [retain(client), retain(client), retain(client)];
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  expect(raw.observeStream).toHaveBeenCalledTimes(1);
  releases[0]!();
  releases[1]!();
  expect(opened[0]!.close).not.toHaveBeenCalled();
  releases[2]!();
  expect(opened[0]!.close).toHaveBeenCalledTimes(1);
  const again = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(2));
  again();
});

it("closes a stream that finishes opening after its last consumer left", async () => {
  let finish!: () => void;
  const { client, opened } = fakeClient({ open: () => new Promise<void>((resolve) => (finish = resolve)) });
  const release = retain(client);
  release();
  finish();
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await vi.waitFor(() => expect(opened[0]!.close).toHaveBeenCalledTimes(1));
});

it("keeps computers separate: another transport has its own stream, state and cache key", async () => {
  const first = fakeClient();
  const second = fakeClient();
  second.raw.machine.id = "m2";
  const otherKey = ["machine", "m2", "projects", "directory", { method: "projects.directory", params: {} }];
  const releaseFirst = retain(first.client);
  const releaseSecond = retainDirectorySync(cache, second.client, { key: otherKey, canApply: () => true });
  await vi.waitFor(() => expect(first.opened).toHaveLength(1));
  await vi.waitFor(() => expect(second.opened).toHaveLength(1));
  await first.opened[0]!.apply(event(["a"]), current);
  expect(directorySyncState(cache, first.client)).toBe("live");
  expect(directorySyncState(cache, second.client)).toBe("catching-up");
  expect(cache.getQueryData(otherKey)).toBeUndefined();
  releaseFirst();
  expect(second.opened[0]!.close).not.toHaveBeenCalled();
  releaseSecond();
});

it("falls back to polling for a malformed snapshot and does not retry the stream", async () => {
  const { client, opened, raw } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  await expect(opened[0]!.apply(snapshot({ projects: [] }), current)).rejects.toThrow();
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(directorySyncState(cache, client)).toBe("polling");
  expect(opened[0]!.close).toHaveBeenCalledTimes(1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(raw.observeStream).toHaveBeenCalledTimes(1);
  release();
});

it("polls when the stream is unsupported and retries a transient open failure", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const unsupported = fakeClient({ capabilities: ["transport.ws.streams.v2"] });
  expect(supportsDirectoryStream(unsupported.client)).toBe(false);
  const refused = fakeClient();
  refused.raw.observeStream.mockRejectedValueOnce(new RemoteHostError("m1", "unsupported", "no"));
  const stop = retain(refused.client);
  await vi.advanceTimersByTimeAsync(0);
  expect(directorySyncState(cache, refused.client)).toBe("polling");
  expect(refused.raw.observeStream).toHaveBeenCalledTimes(1);
  stop();
  const flaky = fakeClient();
  flaky.raw.observeStream.mockRejectedValueOnce(new RemoteHostError("m1", "network", "down"));
  const release = retain(flaky.client);
  await vi.advanceTimersByTimeAsync(0);
  expect(directorySyncState(cache, flaky.client)).toBe("stale");
  await vi.advanceTimersByTimeAsync(31_000);
  expect(flaky.raw.observeStream).toHaveBeenCalledTimes(2);
  release();
});

it("lets a newer stream snapshot supersede a slower RPC read", async () => {
  const { client, opened } = fakeClient();
  const release = retain(client);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  const slow = directoryReadFence(cache, key);
  await opened[0]!.apply(event(["fresh"]), current);
  expect(slow(directory(["stale"]))).toEqual(directory(["fresh"]));
  const after = directoryReadFence(cache, key);
  expect(after(directory(["rpc"]))).toEqual(directory(["rpc"]));
  release();
});

it("reopens for a consumer that returned while the previous attempt was still opening", async () => {
  let finish!: () => void;
  const { client, opened, raw } = fakeClient({ open: () => new Promise<void>((resolve) => (finish = resolve)) });
  retain(client)();
  const again = retain(client);
  finish();
  await vi.waitFor(() => expect(raw.observeStream).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(opened.length).toBeGreaterThan(0));
  again();
});
