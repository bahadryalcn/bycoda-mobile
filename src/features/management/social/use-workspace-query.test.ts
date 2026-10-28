// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SocialSnapshot } from "@/domain/types";
import { useSocialWorkspace } from "./use-workspace-query";

const fixture = vi.hoisted(() => ({
  machine: { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" },
  data: undefined as SocialSnapshot | undefined,
  key: [] as readonly unknown[], params: {} as Record<string, unknown>,
  options: {} as { enabled?: boolean; queryFn?: (client: { request: (...args: unknown[]) => Promise<unknown> }, signal: AbortSignal) => Promise<SocialSnapshot> },
  serial: 0,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `scope-${++fixture.serial}` }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => fixture.machine,
  useMachines: { getState: () => ({ activeId: fixture.machine.id, machines: [fixture.machine] }) },
}));
vi.mock("@/state/queries", () => ({ useHostQuery: (key: readonly unknown[], _method: string, params: Record<string, unknown>, options: typeof fixture.options) => {
  fixture.key = key; fixture.params = params; fixture.options = options;
  return { data: fixture.data, isError: false, error: null, isFetching: false };
} }));

let root: ReturnType<typeof createRoot>;
let current: ReturnType<typeof useSocialWorkspace>;
function Harness() { current = useSocialWorkspace("inbox", "project"); return null; }
async function render() { await act(async () => root.render(createElement(Harness))); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.machine = { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" };
  fixture.data = undefined;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("debounces valid global filters, resets the host page and never enables an oversized search", async () => {
  await render();
  await act(async () => current.page!.onOffset(40));
  expect(fixture.params.input).toMatchObject({ offsets: { threads: 40 } });
  await act(async () => current.page!.setSearch("needle"));
  expect(fixture.options.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(299));
  expect(fixture.options.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(fixture.options.enabled).toBe(true);
  expect(fixture.params.input).toMatchObject({ offsets: { threads: 0 }, filters: { threads: { query: "needle" } } });
  await act(async () => current.page!.setSearch("x".repeat(1001)));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(fixture.options.enabled).toBe(false);
  expect(current.page!.invalidSearch).toBe(true);
  expect(current.page!.search).toHaveLength(1001);
});

it("does not reuse a connection scope or cache when the same saved machine is paired to another identity", async () => {
  await render();
  const firstKey = JSON.stringify(fixture.key);
  expect(firstKey).not.toContain("private-key");
  fixture.machine = { ...fixture.machine, endpoint: "https://two.example", lanKey: "another-private-key" };
  await render();
  expect(JSON.stringify(fixture.key)).not.toBe(firstKey);
  expect(JSON.stringify(fixture.key)).not.toContain("another-private-key");
  expect(current.state).toBeUndefined();
  expect(current.page!.loading).toBe(true);
});
