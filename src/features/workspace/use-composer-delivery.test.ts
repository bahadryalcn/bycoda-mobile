// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HostSession } from "./wire";
import { useComposerDelivery } from "./use-composer-delivery";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));

const client = { machine: { capabilities: ["sessions.steer"] } } as never;
const session = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, runId: "run", session: {}, ...extra }) as unknown as HostSession;
let latest: ReturnType<typeof useComposerDelivery>;
let root: ReturnType<typeof createRoot> | undefined;
const props = { client, queueSupported: true };

function Probe(input: { session?: HostSession; queueSupported: boolean }) {
  const delivery = useComposerDelivery({ client, session: input.session, queueSupported: input.queueSupported });
  useLayoutEffect(() => {
    latest = delivery;
  });
  return null;
}
async function render(input: { session?: HostSession; queueSupported?: boolean }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Probe, { ...props, ...input })));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

it("starts on Send and picks Queue when the first snapshot is already running", async () => {
  await render({ session: undefined });
  expect(latest.mode).toBe("send");
  await render({ session: session("running") });
  expect(latest.mode).toBe("queue");
  expect(latest.showModeChip).toBe(true);
});

it("initializes only once: a later snapshot does not override the mode", async () => {
  await render({ session: session("idle") });
  expect(latest.mode).toBe("send");
  await render({ session: session("running") });
  expect(latest.mode).toBe("send");
});

it("drops a stale Steer choice when the run finishes", async () => {
  await render({ session: session("idle") });
  await render({ session: session("running") });
  await act(async () => latest.choose("steer"));
  expect(latest.mode).toBe("steer");
  await render({ session: session("idle") });
  expect(latest.mode).toBe("send");
});

it("keeps an explicitly chosen Queue after the run finishes", async () => {
  await render({ session: session("running") });
  await act(async () => latest.choose("queue"));
  await render({ session: session("idle") });
  expect(latest.mode).toBe("queue");
});
