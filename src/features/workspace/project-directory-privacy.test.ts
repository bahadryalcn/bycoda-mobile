// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectList } from "./use-project-directory";
import { useProjectActivity } from "./use-project-activity";
import { invalidateProjectPrivacy, projectPrivacyKey } from "./project-privacy-cache";
import { getQueryPresentation } from "@/ui/query-presentation";
const state = vi.hoisted(() => ({ allowed: true, machine: { id: "machine", environmentId: "host", capabilities: ["projects.directory.v1"] }, response: { privacyReady: true, groups: [], projects: [] } as unknown }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand"); return { useActiveMachine: () => state.machine, useMachines: create(() => ({ machines: [state.machine], activeId: "machine", hydrated: true, storageError: null, connectionPending: false })) };
});
vi.mock("@/state/security", async () => {
  const { create } = await import("zustand"); return { useSecurity: create(() => ({ status: "unlocked", appState: "active", windowFocused: true })), isAppAccessAllowed: () => state.allowed };
});
vi.mock("../privacy/consent-access", () => ({ hasProviderPermission: () => state.allowed }));
vi.mock("@/state/queries", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return { hostKey: (id: string, key: unknown[]) => ["machine", id, ...key], useHostReadActive: () => true,
    useHostClient: () => state.allowed ? { request: async (_method: string, params: { projects: { projectId: string }[] }) => ({ instanceId: "fixture", reset: true,
      projects: params.projects.map(({ projectId }) => ({ projectId, etag: "fixture", sessions: [] })) }) } : null,
    useHostQuery: (key: unknown[], method: string, params: unknown, options: { enabled: boolean }) => useQuery({ queryKey: ["machine", "machine", ...key, { method, params }], queryFn: async () => state.response, enabled: state.allowed && options.enabled, staleTime: Infinity, retry: false }) };
});
let result: ReturnType<typeof useProjectList>; let root: ReturnType<typeof createRoot> | undefined; let cache: QueryClient;
const key = projectPrivacyKey("machine", true); const visible = () => ({ privacyReady: true, groups: [], projects: [{ id: "visible", name: "Visible", cwd: "/fixture", registered: true }] });
function Probe() { result = useProjectList(); return null; }
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); cache ??= new QueryClient(); root ??= createRoot(document.createElement("div")); await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe)))); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; cache?.clear(); cache = undefined as never; state.allowed = true; state.response = { privacyReady: true, groups: [], projects: [] }; vi.unstubAllGlobals(); });
it("a privacy-pending directory cannot expose formerly cached project metadata", async () => {
  cache = new QueryClient(); cache.setQueryData(key, { ...visible(), privacyReady: false }); await render(); expect(result.data).toEqual([]); expect(result.isProjectVisible("visible")).toBe(false);
  expect(result.privacyUnavailable).toBe(true); expect(result.directoryReady).toBe(false);
  expect(getQueryPresentation(result, true)).toBe("ready");
});
it("expired visibility proof hides cached projects until a fresh directory response", async () => {
  cache = new QueryClient(); cache.setQueryData(key, visible()); await render(); expect(result.isProjectVisible("visible")).toBe(true);
  await act(async () => { await invalidateProjectPrivacy(cache); }); expect(result.data).toBeUndefined(); expect(result.privacyPending).toBe(true); expect(result.isProjectVisible("visible")).toBe(false);
  expect(result.privacyUnavailable).toBe(false); expect(result.isSuccess).toBe(false);
  expect(getQueryPresentation(result, true)).toBe("idle");
  await act(async () => {
    cache.setQueryData(key, { privacyReady: true, groups: [], projects: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }); expect(result.data).toEqual([]); expect(result.isProjectVisible("visible")).toBe(false);
});
it("consent revocation conceals metadata and expires proof, while ordinary refresh errors retain proven visibility", async () => {
  cache = new QueryClient(); cache.setQueryData(key, visible()); await render();
  await act(async () => { cache.getQueryCache().find({ queryKey: key, exact: true })!.setState({ status: "error", error: new Error("Network unavailable") }); });
  expect(result.data?.[0]?.id).toBe("visible"); expect(result.isProjectVisible("visible")).toBe(true);
  expect(result.directoryReady).toBe(true);
  state.allowed = false; await render(); expect(result.data).toBeUndefined(); expect(result.isProjectVisible("visible")).toBe(false);
  await vi.waitFor(() => expect(cache.getQueryState(key)?.isInvalidated).toBe(true));
});
it("shows first load and expired-proof revalidation as loading rather than missing or sync-required", async () => {
  let finish!: (value: unknown) => void;
  state.response = new Promise((resolve) => { finish = resolve; });
  await render();
  expect(result.verifying).toBe(true); expect(result.privacyUnavailable).toBe(false);
  expect(result.directoryReady).toBe(false); expect(getQueryPresentation(result, true)).toBe("loading");
  await act(async () => {
    const loading = result.refetch();
    finish(visible());
    await loading;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(result.directoryReady).toBe(true);
  await act(async () => { await invalidateProjectPrivacy(cache); });
  let finishRefresh!: (value: unknown) => void;
  state.response = new Promise((resolve) => { finishRefresh = resolve; });
  let refresh: Promise<unknown>;
  await act(async () => {
    refresh = result.refetch();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(result.data).toBeUndefined(); expect(result.verifying).toBe(true);
  expect(result.privacyUnavailable).toBe(false); expect(getQueryPresentation(result, true)).toBe("loading");
  await act(async () => {
    finishRefresh(visible());
    await refresh;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(result.directoryReady).toBe(true);
  expect(result.isProjectVisible("visible")).toBe(true);
});
it("paired tab and project activity consumers can revalidate visibility without cross-render updates", async () => {
  function ProjectsConsumer() { useProjectActivity(); return null; }
  function TabsConsumer() { useProjectActivity(); return createElement(ProjectsConsumer); }
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cache = new QueryClient();
  cache.setQueryData(key, visible());
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root!.render(createElement(QueryClientProvider, { client: cache }, createElement(TabsConsumer)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => { await invalidateProjectPrivacy(cache); });
  await act(async () => {
    cache.setQueryData(key, { ...visible(), projects: [{ id: "second", name: "Second", cwd: "/second", registered: true }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const crossRenderErrors = errors.mock.calls.filter((args) => args.some((value) => String(value).includes("Cannot update a component")));
  errors.mockRestore();
  expect(crossRenderErrors).toEqual([]);
});
