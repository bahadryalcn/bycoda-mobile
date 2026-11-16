import { afterEach, expect, it, vi } from "vitest";
import type { HostTransport } from "./transport";
import { RemoteHostError } from "./host-error";

const state = vi.hoisted(() => ({ opened: [] as { projectId: string; close: ReturnType<typeof vi.fn>; apply: Function; onError: Function }[] }));
vi.mock("./session-sync", () => ({
  watchProjectStream: vi.fn(async (_client: unknown, projectId: string, apply: Function, onError: Function) => {
    const close = vi.fn();
    state.opened.push({ projectId, close, apply, onError });
    return { close };
  }),
}));
import { retainProjectStream, type ProjectStreamValue } from "./project-stream-hub";

afterEach(() => {
  state.opened.length = 0;
});
const client = () => ({ assertCurrentAccess: vi.fn() }) as unknown as HostTransport;
const listener = () => ({ apply: vi.fn(async (_value: ProjectStreamValue, _current: () => void) => undefined), onError: vi.fn() });
const value = { etag: "e", sessions: [] };

it("opens one Host stream per project for any number of consumers", async () => {
  const c = client();
  const [a, b, d] = [listener(), listener(), listener()];
  const releases = [a, b, d].map((l) => retainProjectStream(c, "p1", l));
  await Promise.resolve();
  expect(state.opened).toHaveLength(1);
  await state.opened[0]!.apply(value, () => undefined);
  for (const l of [a, b, d]) expect(l.apply).toHaveBeenCalledWith(value, expect.any(Function));
  releases[0]!();
  releases[1]!();
  expect(state.opened[0]!.close).not.toHaveBeenCalled();
  releases[2]!();
  expect(state.opened[0]!.close).toHaveBeenCalledTimes(1);
});

it("replays the last snapshot to a late consumer and isolates consumer failures", async () => {
  const c = client();
  const early = listener();
  early.apply.mockRejectedValue(new Error("boom"));
  const release = retainProjectStream(c, "p1", early);
  await Promise.resolve();
  const late = listener();
  await state.opened[0]!.apply(value, () => undefined);
  expect(early.onError).toHaveBeenCalledTimes(1);
  retainProjectStream(c, "p1", late);
  await Promise.resolve();
  expect(late.apply).toHaveBeenCalledWith(value, expect.any(Function));
  release();
});

it("keeps separate streams per project and per transport", async () => {
  const c = client();
  retainProjectStream(c, "p1", listener());
  retainProjectStream(c, "p2", listener());
  retainProjectStream(client(), "p1", listener());
  await Promise.resolve();
  expect(state.opened.map((o) => o.projectId)).toEqual(["p1", "p2", "p1"]);
});

it("drops a terminal stream and never replays its removed project snapshot", async () => {
  const c = client();
  const early = listener();
  const release = retainProjectStream(c, "p1", early);
  await Promise.resolve();
  await state.opened[0]!.apply(value, () => undefined);
  state.opened[0]!.onError(new RemoteHostError("machine", "identity", "Project removed."));
  const late = listener();
  const releaseLate = retainProjectStream(c, "p1", late);
  await Promise.resolve();
  expect(state.opened).toHaveLength(2);
  expect(late.apply).not.toHaveBeenCalled();
  expect(state.opened[0]!.close).toHaveBeenCalledTimes(1);
  release();
  releaseLate();
});

it("does not replay an older snapshot after a newer event reaches the late consumer", async () => {
  const c = client();
  const release = retainProjectStream(c, "p1", listener());
  await Promise.resolve();
  await state.opened[0]!.apply(value, () => undefined);
  const late = listener();
  const releaseLate = retainProjectStream(c, "p1", late);
  const next = { etag: "new", sessions: [] };
  await state.opened[0]!.apply(next, () => undefined);
  expect(late.apply.mock.calls.map((call) => call[0])).toEqual([next]);
  release();
  releaseLate();
});

it("rejects an old callback after the final consumer releases its stream", async () => {
  const c = client();
  const consumer = listener();
  const release = retainProjectStream(c, "p1", consumer);
  await Promise.resolve();
  release();
  await expect(state.opened[0]!.apply(value, () => undefined)).rejects.toThrow();
  expect(consumer.apply).not.toHaveBeenCalled();
});

it("fences a late consumer's pending write when its stream is retired", async () => {
  const c = client();
  const release = retainProjectStream(c, "p1", listener());
  await Promise.resolve();
  await state.opened[0]!.apply(value, () => undefined);
  const late = listener();
  const releaseLate = retainProjectStream(c, "p1", late);
  await Promise.resolve();
  const current = late.apply.mock.calls[0]![1];
  expect(() => current()).not.toThrow();
  state.opened[0]!.onError(new RemoteHostError("machine", "identity", "Project removed."));
  expect(() => current()).toThrow("The project stream is no longer current.");
  release();
  releaseLate();
});
