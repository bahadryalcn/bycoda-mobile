import { afterEach, expect, it, vi } from "vitest";
import type { HostTransport } from "./transport";

const state = vi.hoisted(() => ({ opened: [] as { projectId: string; close: ReturnType<typeof vi.fn>; apply: Function; onError: Function }[] }));
vi.mock("./session-sync", () => ({
  watchProjectStream: vi.fn(async (_client: unknown, projectId: string, apply: Function, onError: Function) => {
    const close = vi.fn();
    state.opened.push({ projectId, close, apply, onError });
    return { close };
  }),
}));
import { retainProjectStream } from "./project-stream-hub";

afterEach(() => {
  state.opened.length = 0;
});
const client = () => ({}) as HostTransport;
const listener = () => ({ apply: vi.fn(async () => undefined), onError: vi.fn() });
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
