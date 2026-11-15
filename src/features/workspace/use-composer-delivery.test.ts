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

function Probe(input: { session?: HostSession; queueSupported: boolean; busyPreferred?: "steer" | "queue" }) {
  const delivery = useComposerDelivery({ client, session: input.session, queueSupported: input.queueSupported, busyPreferred: input.busyPreferred });
  useLayoutEffect(() => {
    latest = delivery;
  });
  return null;
}
async function render(input: { session?: HostSession; queueSupported?: boolean; busyPreferred?: "steer" | "queue" }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Probe, { ...props, ...input })));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

it("starts on Send and uses the preferred busy mode while a run is active", async () => {
  await render({ session: undefined });
  expect(latest.mode).toBe("send");
  await render({ session: session("running") });
  expect(latest.mode).toBe("steer");
  await render({ session: session("running"), busyPreferred: "queue" });
  expect(latest.mode).toBe("queue");
  await render({ session: session("running"), busyPreferred: "steer", queueSupported: false });
  expect(latest.mode).toBe("steer");
});

it("follows the busy preference when a run starts, and returns to Send when it ends", async () => {
  await render({ session: session("idle") });
  expect(latest.mode).toBe("send");
  await render({ session: session("running"), busyPreferred: "queue" });
  expect(latest.mode).toBe("queue");
  await render({ session: session("idle"), busyPreferred: "queue" });
  expect(latest.mode).toBe("send");
});

it("has no composer override for the Settings preference", async () => {
  await render({ session: session("running") });
  expect(latest).not.toHaveProperty("choose");
  expect(latest).not.toHaveProperty("showModeChip");
  expect(latest).not.toHaveProperty("options");
});

it("returns to Send after a queued busy preference, without a sticky local mode", async () => {
  await render({ session: session("running"), busyPreferred: "queue" });
  expect(latest.mode).toBe("queue");
  await render({ session: session("idle") });
  expect(latest.mode).toBe("send");
});
