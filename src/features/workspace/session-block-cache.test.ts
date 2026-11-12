// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useSessionBlock } from "./session-queries";

const state = vi.hoisted(() => ({ request: vi.fn(), resolveSync: vi.fn() }));
vi.mock("@/state/queries", () => ({
  hostKey: (machine: string, key: unknown[]) => ["machine", machine, ...key],
  useHostClient: () => ({ machine: { id: "machine" }, request: state.request }),
  useHostReadActive: () => true,
}));
vi.mock("./wire", () => ({ readSession: vi.fn(), readEarlier: vi.fn(), resolveSync: state.resolveSync }));

let root: ReturnType<typeof createRoot> | undefined;
let cache: QueryClient;
function Probe(props: { revision: number; digest?: string; blockId?: string }) {
  useSessionBlock({
    scope: { machineId: "machine", sessionId: "session" },
    blockId: props.blockId ?? "block",
    getRevision: () => props.revision,
    digest: props.digest,
    enabled: true,
  });
  return null;
}
async function render(props: Parameters<typeof Probe>[0]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root ??= createRoot(document.createElement("div"));
  await act(async () =>
    root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe, props))),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  cache?.clear();
  cache = undefined as never;
  state.request.mockReset();
  state.resolveSync.mockReset();
  vi.unstubAllGlobals();
});
const reply = (id: string) => {
  state.request.mockResolvedValue({});
  state.resolveSync.mockResolvedValue({
    kind: "snapshot",
    value: { session: { id: "session", blocks: [{ id, text: "x" }] } },
  });
};

it("does not refetch a block with an unchanged digest when the session revision advances", async () => {
  reply("block");
  await render({ revision: 1, digest: "a" });
  await vi.waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  await render({ revision: 2, digest: "a" });
  await render({ revision: 3, digest: "a" });
  expect(state.request).toHaveBeenCalledTimes(1);
});

it("keeps one cache entry per block when its content changes", async () => {
  reply("block");
  await render({ revision: 1, digest: "a" });
  await vi.waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  await render({ revision: 2, digest: "b" });
  await vi.waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(
      cache.getQueryCache().findAll({ queryKey: ["machine", "machine", "session-block"] }),
    ).toHaveLength(1),
  );
  expect(state.request).toHaveBeenLastCalledWith(
    "sessions.block",
    expect.objectContaining({ revision: 2 }),
    expect.anything(),
  );
});

it("sends the revision current at fetch time through a stable getter", async () => {
  reply("block");
  const revision = { current: 1 };
  const getRevision = () => revision.current;
  function Stable() {
    useSessionBlock({
      scope: { machineId: "machine", sessionId: "session" },
      blockId: "block",
      getRevision,
      digest: "a",
      enabled: false,
    });
    return null;
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root ??= createRoot(document.createElement("div"));
  const mount = (enabled: boolean) =>
    act(async () =>
      root!.render(
        createElement(
          QueryClientProvider,
          { client: cache },
          createElement(enabled ? Enabled : Stable),
        ),
      ),
    );
  function Enabled() {
    useSessionBlock({
      scope: { machineId: "machine", sessionId: "session" },
      blockId: "block",
      getRevision,
      digest: "a",
      enabled: true,
    });
    return null;
  }
  await mount(false);
  revision.current = 7; // revision-only update: no re-render happens
  await mount(true);
  await vi.waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  expect(state.request).toHaveBeenCalledWith(
    "sessions.block",
    expect.objectContaining({ revision: 7 }),
    expect.anything(),
  );
});
