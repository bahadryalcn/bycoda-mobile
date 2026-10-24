// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { create } from "zustand";

const fixture = vi.hoisted(() => ({
  focused: true,
  request: vi.fn(),
  machine: { id: "pc", endpoint: "https://pc.example", environmentId: "env", capabilities: [], providers: [] },
  guard: undefined as undefined | (() => void),
}));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => fixture.focused }));
vi.mock("../remote/transport", () => ({
  HostTransport: class {
    constructor(_machine: unknown, _credential: unknown, _fetcher: unknown, guard: () => void) { fixture.guard = guard; }
    machine = fixture.machine;
    request = fixture.request;
  },
}));
vi.mock("./machines", () => ({
  useActiveMachine: () => fixture.machine,
  useMachines: create(() => ({ hydrated: true, storageError: null, connectionPending: false })),
  credentials: { get: vi.fn() },
}));
vi.mock("./security", () => ({
  useSecurity: create(() => ({ status: "unlocked", appState: "active", windowFocused: true })),
  assertAppAccess: vi.fn(),
}));
vi.mock("../features/privacy/consent-access", () => ({
  useProviderPermission: (selector: (state: unknown) => unknown) => selector({ scopes: { scope: true } }),
  assertProviderPermission: vi.fn(),
  readPermittedCredential: vi.fn(),
}));
vi.mock("../features/privacy/consent-store", () => ({ consentScope: () => "scope" }));
vi.mock("../features/workspace/attachment-ownership", () => ({ attachmentReleases: { flush: vi.fn() } }));

import { useSecurity } from "./security";
import { hostKey, useHostClient, useHostQuery } from "./queries";
import { PrivateContentAccessProvider } from "../ui/private-access";
import { useModelCatalog } from "./model-catalog";

let root: Root;
let element: HTMLDivElement;
let cache: QueryClient;
let enabled = true;
let visibleData: unknown;
function Probe() {
  visibleData = useHostQuery(["notes"], "notes.list", {}, { interval: 1000, enabled }).data;
  return null;
}
const render = () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe)));

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixture.focused = true;
  enabled = true;
  visibleData = undefined;
  fixture.guard = undefined;
  fixture.request.mockReset().mockResolvedValue(["saved"]);
  useSecurity.setState({ status: "unlocked", appState: "active", windowFocused: true });
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  element.remove();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

it("keeps cached content but stops hidden-route polling and invalidation refetches, then refreshes on return", async () => {
  await act(async () => { render(); await vi.advanceTimersByTimeAsync(1); });
  expect(fixture.request).toHaveBeenCalledTimes(1);
  fixture.focused = false;
  await act(async () => { render(); });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: hostKey("pc", ["notes"]) });
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fixture.request).toHaveBeenCalledTimes(1);
  expect(visibleData).toEqual(["saved"]);
  fixture.focused = true;
  await act(async () => { render(); await vi.advanceTimersByTimeAsync(1); });
  expect(fixture.request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fixture.request).toHaveBeenCalledTimes(3);
});

for (const state of [{ appState: "background" }, { appState: "inactive" }, { windowFocused: false }, { status: "locked" }] as const) {
  it(`suspends automatic host reads for ${JSON.stringify(state)} and recovers once active`, async () => {
    await act(async () => { useSecurity.setState(state); render(); await vi.advanceTimersByTimeAsync(10_000); });
    expect(fixture.request).not.toHaveBeenCalled();
    await act(async () => {
      useSecurity.setState({ status: "unlocked", appState: "active", windowFocused: true });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fixture.request).toHaveBeenCalledTimes(1);
  });
}

it("preserves explicit disabled queries and LAN reads while internet connectivity is absent", async () => {
  enabled = false;
  onlineManager.setOnline(false);
  await act(async () => { render(); await vi.advanceTimersByTimeAsync(5000); });
  expect(fixture.request).not.toHaveBeenCalled();
  enabled = true;
  await act(async () => { render(); await vi.advanceTimersByTimeAsync(1); });
  expect(fixture.request).toHaveBeenCalledTimes(1);
});


it("polls progressive model discovery only while providers remain pending and preserves ready models", async () => {
  const ready = { models: { codex: [{ id: "ready-model", name: "Ready" }] }, errors: {}, pending: ["claude"] };
  fixture.request.mockResolvedValueOnce(ready).mockResolvedValue({ ...ready, pending: [] });
  function ModelProbe() { visibleData = useModelCatalog("project").data; return null; }
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: cache }, createElement(ModelProbe)));
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(visibleData).toEqual(ready);
  expect(fixture.request).toHaveBeenCalledWith("models.list", { projectId: "project", progressive: true }, expect.anything());
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fixture.request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fixture.request).toHaveBeenCalledTimes(2);
});

it("stops progressive catalog polling on failure instead of hammering a disconnected host", async () => {
  fixture.request.mockResolvedValueOnce({ models: {}, errors: {}, pending: ["codex"] }).mockRejectedValue(new Error("offline"));
  function ModelProbe() { useModelCatalog("project"); return null; }
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: cache }, createElement(ModelProbe)));
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(fixture.request).toHaveBeenCalledTimes(2);
});
it("a previously captured transport access guard refuses a revoked private workspace before reading credentials", async () => {
  let allowed = true;
  function ClientProbe() { useHostClient(); return null; }
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache },
    createElement(PrivateContentAccessProvider, { value: { allowed: true, check: () => allowed } }, createElement(ClientProbe)))));
  const guard = fixture.guard; expect(guard).toBeTypeOf("function"); allowed = false;
  expect(() => guard!()).toThrow("private workspace is no longer available");
});
