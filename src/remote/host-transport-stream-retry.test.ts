import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager } from "@tanstack/react-query";
import { HostTransport } from "./host-transport";
import { HostWsError } from "./ws-connection";
import { binding } from "./ws-connection.test-fixture";
import { registerHostWsRuntimeProvider, type HostWsConsumer } from "./ws-runtime-port";
import type { AppliedHostEvent } from "./ws-connection";

const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(openResults: (attempt: number) => unknown) {
  let handler: AppliedHostEvent | undefined;
  const opens: string[] = [];
  const consumer: HostWsConsumer = {
    supports: () => true,
    state: () => "ready",
    onState: () => () => undefined,
    subscribe: (next) => {
      handler = next;
      return () => undefined;
    },
    release: () => undefined,
    request: (async (method: string, params: Record<string, unknown> = {}) => {
      if (method !== "subscriptions.open") return { accepted: true };
      opens.push(params.subscriptionId as string);
      const result = openResults(opens.length);
      if (result instanceof Error) throw result;
      return { subscriptionId: params.subscriptionId, streamId: `stream-${opens.length}` };
    }) as HostWsConsumer["request"],
  };
  cleanups.push(
    registerHostWsRuntimeProvider({ acquire: async () => consumer, remember: vi.fn() }),
  );
  const capabilities = ["transport.ws.read.v2", "transport.ws.streams.v2"];
  const client = new HostTransport(
    {
      id: binding.machineId,
      environmentId: binding.environmentId,
      endpoint: "https://host.example",
      name: "Host",
      capabilities,
    },
    async () => {
      throw new Error("No JS credential access");
    },
  );
  cleanups.push(() => client.dispose());
  return { client, opens, deliver: (event: Parameters<AppliedHostEvent>[0]) => handler!(event, () => undefined) };
}
const target = { kind: "project", projectId: "project-a" } as const;

it("re-subscribes with backoff after the open fails, instead of staying dead", async () => {
  const f = setup((attempt) => (attempt === 1 ? new HostWsError("network") : undefined));
  const errors: Error[] = [];
  await f.client.observeStream(target, async () => true, (error) => errors.push(error));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.opens).toHaveLength(1);
  expect(errors).toHaveLength(1);
  // random()=0.5 of the 500ms first-attempt ceiling.
  await vi.advanceTimersByTimeAsync(300);
  expect(f.opens.length).toBe(2);
});

it("does not retry a terminal access failure", async () => {
  const f = setup(() => new HostWsError("authentication"));
  await f.client.observeStream(target, async () => true, () => undefined);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.opens).toHaveLength(1);
});

it("reprobes immediately when the app regains focus", async () => {
  const f = setup((attempt) => (attempt === 1 ? new HostWsError("network") : undefined));
  await f.client.observeStream(target, async () => true, () => undefined);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.opens).toHaveLength(1);
  focusManager.setFocused(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.opens.length).toBe(2);
});

it("reports catching-up until an event is applied and again after a resync", async () => {
  const f = setup(() => undefined);
  const phases: string[] = [];
  await f.client.observeStream(
    { kind: "environment" },
    async () => true,
    () => undefined,
    (phase) => phases.push(phase),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(phases).toEqual(["catching-up"]);
  const params = { subscriptionId: "", streamId: "stream-1", cursor: { epoch: "e", sequence: 1 } };
  const subscriptionId = f.opens[0]!;
  await f.deliver({
    jsonrpc: "2.0",
    method: "subscription.event",
    params: { ...params, subscriptionId, kind: "snapshot", data: {} },
  });
  expect(phases).toEqual(["catching-up", "live"]);
  await f.deliver({
    jsonrpc: "2.0",
    method: "subscription.event",
    params: { ...params, subscriptionId, kind: "resync-required" },
  });
  expect(phases.at(-1)).toBe("catching-up");
});
