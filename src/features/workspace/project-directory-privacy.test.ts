// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectList } from "./use-project-directory";
import { useProjectActivity } from "./use-project-activity";
import { invalidateProjectPrivacy, projectPrivacyKey } from "./project-privacy-cache";
import { getQueryPresentation } from "@/ui/query-presentation";
const state = vi.hoisted(() => ({ allowed: true, machine: { id: "machine", environmentId: "host", capabilities: ["projects.directory.v1"] }, response: { privacyReady: true, groups: [], projects: [] } as unknown, staleData: undefined as unknown }));
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
    useHostQuery: (key: unknown[], method: string, params: unknown, options: { enabled: boolean }) => {
      const query = useQuery({ queryKey: ["machine", "machine", ...key, { method, params }], queryFn: async () => state.response, enabled: state.allowed && options.enabled, staleTime: Infinity, retry: false });
      const observer = state.staleData === undefined ? query : { ...query, data: state.staleData };
      return query.isError && ["auth", "identity"].includes((query.error as any)?.kind) ? { ...observer, data: undefined } : observer;
    } };
});
let result: ReturnType<typeof useProjectList>; let root: ReturnType<typeof createRoot> | undefined; let cache: QueryClient;
const key = projectPrivacyKey("machine", true); const visible = () => ({ privacyReady: true, groups: [], projects: [{ id: "visible", name: "Visible", cwd: "/fixture", registered: true }] });
function Probe() { result = useProjectList(); return null; }
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); cache ??= new QueryClient(); root ??= createRoot(document.createElement("div")); await act(async () => root!.render(createElement(QueryClientProvider, { client: cache }, createElement(Probe)))); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; cache?.clear(); cache = undefined as never; state.allowed = true; state.response = { privacyReady: true, groups: [], projects: [] }; state.staleData = undefined; vi.unstubAllGlobals(); });
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

it.each([true,false])("checks an optional original folder against the live %s directory cache",async grouped=>{
 const capabilities=state.machine.capabilities;state.machine.capabilities=grouped?["projects.directory.v1"]:[];
 try{cache=new QueryClient();const currentKey=projectPrivacyKey("machine",grouped);cache.setQueryData(currentKey,grouped?visible():visible().projects);await render();
 expect(result.isProjectVisible("visible")).toBe(true);expect(result.isProjectVisible("visible","/fixture")).toBe(true);expect(result.isProjectVisible("visible","/other")).toBe(false);
 const check=result.isProjectVisible;await act(async()=>{const changed={...visible().projects[0]!,cwd:"/changed"};cache.setQueryData(currentKey,grouped?{...visible(),projects:[changed]}:[changed]);expect(check("visible","/fixture")).toBe(false);expect(check("visible","/changed")).toBe(true);expect(check("visible")).toBe(true);});
 }finally{state.machine.capabilities=capabilities;}
});

it.each([true, false].flatMap(grouped => ["auth", "identity"].map(kind => ({ grouped, kind }))))(
  "keeps $grouped directory proof denied after $kind then network failure until completed success", async ({ grouped, kind }) => {
    const capabilities = state.machine.capabilities; state.machine.capabilities = grouped ? ["projects.directory.v1"] : [];
    try {
      cache = new QueryClient(); const currentKey = projectPrivacyKey("machine", grouped);
      cache.setQueryData(currentKey, grouped ? visible() : visible().projects); await render(); expect(result.data?.[0]?.id).toBe("visible");
      const owner = cache.getQueryCache().find({ queryKey: currentKey, exact: true })!;
      await act(async () => owner.setState({ status: "error", error: Object.assign(Error("denied"), { kind }) })); await render();
      expect(result.data).toBeUndefined(); expect(result.isProjectVisible("visible")).toBe(false);
      await act(async () => owner.setState({ status: "error", error: Error("network") })); await render();
      expect(result.data).toBeUndefined(); expect(result.directoryReady).toBe(false); expect(result.isProjectVisible("visible")).toBe(false);
      expect(getQueryPresentation(result, true)).toBe("error");
      await act(async () => owner.setState({ status: "success", error: null, fetchStatus: "fetching" })); await render(); expect(result.data).toBeUndefined();
      await act(async () => { owner.setState({ fetchStatus: "idle" }); }); await render(); expect(result.data).toBeUndefined();
      await act(async () => cache.setQueryData(currentKey, owner.state.data)); await render(); expect(result.data?.[0]?.id).toBe("visible");
      expect(result.isProjectVisible("visible", "/fixture")).toBe(true);
    } finally { state.machine.capabilities = capabilities; }
  },
);
it("retains denial when errors are batched before React and while the directory is unmounted", async () => {
  cache = new QueryClient(); cache.setQueryData(key, visible()); await render(); const check = result.isProjectVisible;
  const owner = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  await act(async () => {
    owner.setState({ status: "error", error: Object.assign(Error("denied"), { kind: "auth" }) });
    owner.setState({ status: "error", error: Error("network") });
    expect(check("visible")).toBe(false);
  }); await render(); expect(result.data).toBeUndefined();
  await act(async () => root!.unmount()); root = undefined;
  await act(async () => owner.setState({ status: "error", error: Error("another network failure") }));
  await render(); expect(result.data).toBeUndefined(); expect(result.isProjectVisible("visible")).toBe(false);
  await act(async () => cache.setQueryData(key, { ...visible(), projects: [{ ...visible().projects[0], id: "fresh", cwd: "/fresh" }] })); await render();
  expect(result.data?.[0]?.id).toBe("fresh"); expect(result.isProjectVisible("visible")).toBe(false); expect(result.isProjectVisible("fresh", "/fresh")).toBe(true);
});
it("uses current cache content instead of an old successful observer after recovery", async () => {
  cache = new QueryClient(); cache.setQueryData(key, visible()); await render();
  const owner = cache.getQueryCache().find({ queryKey: key, exact: true })!;
  await act(async () => owner.setState({ status: "error", error: Object.assign(Error("denied"), { kind: "auth" }) })); await render();
  state.staleData = visible();
  await act(async () => cache.setQueryData(key, { ...visible(), projects: [{ ...visible().projects[0], id: "fresh", cwd: "/fresh" }] })); await render();
  expect(result.data?.map(project => project.id)).toEqual(["fresh"]);
  expect(result.isProjectVisible("visible")).toBe(false); expect(result.isProjectVisible("fresh", "/fresh")).toBe(true);
});
it.each([true, false])("distinguishes a real background fetch error from explicit privacy expiration for grouped=%s", async grouped => {
  const capabilities = state.machine.capabilities; state.machine.capabilities = grouped ? ["projects.directory.v1"] : [];
  try {
    cache = new QueryClient(); const currentKey = projectPrivacyKey("machine", grouped);
    cache.setQueryData(currentKey, grouped ? visible() : visible().projects); await render();
    await act(async () => { await cache.fetchQuery({ queryKey: currentKey, queryFn: async () => { throw Error("ordinary network failure"); }, retry: false, staleTime: 0 }).catch(() => {}); }); await render();
    expect(cache.getQueryState(currentKey)?.isInvalidated).toBe(true);
    expect(result.data?.[0]?.id).toBe("visible"); expect(result.directoryReady).toBe(true); expect(result.isProjectVisible("visible")).toBe(true);
    await act(async () => { await invalidateProjectPrivacy(cache, "machine"); });
    expect(result.data).toBeUndefined(); expect(result.directoryReady).toBe(false); expect(result.isProjectVisible("visible")).toBe(false);
  } finally { state.machine.capabilities = capabilities; }
});
