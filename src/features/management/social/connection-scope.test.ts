// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sameReviewedMachine, useConnectionScope, type ConnectionScope } from "./connection-scope";

const fixture = vi.hoisted(() => ({ serial: 0, listeners: new Set<() => void>() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `epoch-${++fixture.serial}` }));
vi.mock("@/state/machines", () => ({ useMachines: {
  getState: () => ({ activeId: machine?.id ?? null, machines: machine ? [machine] : [] }),
  subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => fixture.listeners.delete(listener); },
} }));

const base = { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "key-a" };
let machine: typeof base | null = base;
let scope: ConnectionScope<{ id: number }>;
let created = 0;
function Harness() { scope = useConnectionScope(() => ({ id: ++created })); return null; }
let root: ReturnType<typeof createRoot>;
const render = () => act(async () => root.render(createElement(Harness)));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.serial = 0; created = 0; machine = base;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("keeps one epoch and resource across re-renders and machine-object churn", async () => {
  await render();
  const first = scope;
  machine = { ...base };
  await render();
  await render();
  expect(scope).toBe(first);
  expect(created).toBe(1);
});

it("issues a new epoch and resource for endpoint, environment or credential changes, including A -> B -> A", async () => {
  await render();
  const first = scope;
  for (const change of [{ endpoint: "https://two.example" }, { environmentId: "other" }, { lanKey: "key-b" }]) {
    machine = { ...base, ...change };
    await render();
    expect(scope.token).not.toBe(first.token);
    expect(scope.resource).not.toBe(first.resource);
    const changed = scope;
    machine = base;
    await render();
    expect(scope.token).not.toBe(first.token);
    expect(scope.token).not.toBe(changed.token);
  }
});

it("compares every reviewed identity field", () => {
  expect(sameReviewedMachine(base, { ...base })).toBe(true);
  expect(sameReviewedMachine(undefined, undefined)).toBe(true);
  expect(sameReviewedMachine(base, undefined)).toBe(false);
  for (const change of [{ id: "x" }, { endpoint: "x" }, { environmentId: "x" }, { lanKey: "x" }])
    expect(sameReviewedMachine(base, { ...base, ...change })).toBe(false);
});

it("retires the opening epoch before React commits a batched A/B/A replacement", async () => {
  await render();const first=scope;
  await act(async () => {
    machine={...base,endpoint:"https://two.example"};fixture.listeners.forEach(notify=>notify());
    expect(first.isCurrent()).toBe(false);
    machine=base;fixture.listeners.forEach(notify=>notify());
    expect(first.isCurrent()).toBe(false);
  });
  expect(scope).not.toBe(first);expect(scope.resource).not.toBe(first.resource);
  expect(scope.isCurrent()).toBe(true);expect(fixture.listeners.size).toBe(1);
});

it("keeps StrictMode replay valid but immediately rejects a detached editor's authority", async () => {
  await act(async () => root.render(createElement(StrictMode,null,createElement(Harness))));
  const first=scope;expect(first.isCurrent()).toBe(true);expect(fixture.listeners.size).toBe(1);
  await act(async () => root.render(null));
  expect(first.isCurrent()).toBe(false);expect(fixture.listeners.size).toBe(0);
  await render();expect(scope).not.toBe(first);expect(scope.isCurrent()).toBe(true);
});
