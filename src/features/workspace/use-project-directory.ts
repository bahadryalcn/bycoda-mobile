import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { hashKey, notifyManager, useQueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey, useHostClient, useHostQuery } from "@/state/queries";
import { isAppContentVisible, useSecurity } from "@/state/security";
import { hasProviderPermission } from "../privacy/consent-access";
import type { HostProject, HostProjectDirectory } from "@/domain/types";
import { deduplicateProjects } from "./activity-model";
import { distinctDirectoryProjects } from "./project-directory";
import { getProjectDirectoryReadiness } from "./project-readiness";
import { directoryReadFence, directorySyncState, retainDirectorySync, subscribeDirectorySync, supportsDirectoryStream } from "./directory-sync";
import { invalidateProjectPrivacy, projectPrivacyKey, projectVisibilityDenied, projectVisibilityExpired, subscribeProjectPrivacy } from "./project-privacy-cache";
const DIRECTORY_QUERY_KEY = "directory";

/** The reviewed computer is still the active, unlocked, consented one; the same gate guards every cache read. */
function machineReadable(machine: { id: string; environmentId?: string } | undefined | null): boolean {
  const state = useMachines.getState(); const security = useSecurity.getState(); const current = state.machines.find((row) => row.id === machine?.id);
  return !!machine && state.activeId === machine.id && state.hydrated && !state.storageError && !state.connectionPending && !!current &&
    current.environmentId === machine.environmentId && security.status === "unlocked" && security.appState === "active" && isAppContentVisible() && hasProviderPermission(current);
}

export function useProjectDirectory() {
  const machine = useActiveMachine();
  const client = useHostClient();
  const access = useSecurity((state) => state.status === "unlocked" && state.appState === "active");
  const cache = useQueryClient();
  const grouped = !!machine?.capabilities?.includes("projects.directory.v1");
  const visibilityKey = useMemo(() => projectPrivacyKey(machine?.id ?? "", grouped), [machine?.id, grouped]);
  const visibilityHash = useMemo(() => hashKey(visibilityKey), [visibilityKey]);
  const subscribe = useCallback((notify: () => void) => {
    const schedule = notifyManager.batchCalls(notify);
    const releaseProof = subscribeProjectPrivacy(cache, notify);
    const releaseQuery = cache.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== visibilityHash ||
        event.type !== "updated" && event.type !== "added" && event.type !== "removed") return;
      // Query observers can be constructed during another consumer's render.
      // Only directory state changes matter; use React Query's scheduling for
      // restored proof, but conceal invalidated proof immediately.
      if (event.type === "updated" && projectVisibilityExpired(cache, visibilityKey)) notify();
      else schedule();
    });
    return () => { releaseProof(); releaseQuery(); };
  }, [cache, visibilityHash, visibilityKey]);
  const proof = useSyncExternalStore(subscribe, () => projectVisibilityExpired(cache, visibilityKey)
    ? "invalidated" : projectVisibilityDenied(cache, visibilityKey) ? "denied" : "readable", () => "denied");
  const invalidated = proof === "invalidated", denied = proof === "denied";
  const readable = !!client && access && !invalidated && !denied;
  useEffect(() => {
    if ((!client || !access) && machine?.id && cache.getQueryState(visibilityKey) && !invalidated)
      void invalidateProjectPrivacy(cache, machine.id);
  }, [client, access, cache, visibilityKey, invalidated, machine?.id]);
  const streamable = grouped && !!client && supportsDirectoryStream(client);
  // Reason: the directory stream is an external subscription whose lifetime is the transport,
  // not the render; every caller shares one stream and releases it on unmount or computer change.
  useEffect(() => {
    if (!streamable || !client || !access) return;
    return retainDirectorySync(cache, client, {
      key: visibilityKey,
      canApply: () => machineReadable(client.machine) &&
        !projectVisibilityExpired(cache, visibilityKey) && !projectVisibilityDenied(cache, visibilityKey),
    });
  }, [streamable, client, access, cache, visibilityKey]);
  const subscribeSync = useCallback((notify: () => void) => streamable && client ? subscribeDirectorySync(cache, client, notify) : () => undefined, [cache, client, streamable]);
  const sync = useSyncExternalStore(
    subscribeSync,
    () => streamable && client ? directorySyncState(cache, client) : "polling" as const,
    () => "polling" as const,
  );
  const legacy = useHostQuery<HostProject[]>(
    ["projects"],
    "projects.list",
    {},
    { interval: 15_000, enabled: !grouped },
  );
  const directory = useHostQuery<HostProjectDirectory>(
    ["projects", DIRECTORY_QUERY_KEY],
    "projects.directory",
    {},
    {
      // The stream owns freshness while it is live or catching up; the poll is only its fallback.
      interval: () => sync === "live" || sync === "catching-up" ? false : 15_000,
      enabled: grouped,
      queryFn: async (host, signal) => {
        const settle = directoryReadFence(cache, visibilityKey);
        return settle(await host.request<HostProjectDirectory>("projects.directory", {}, { signal }));
      },
    },
  );
  const source = grouped ? directory : legacy;
  // Use the authoritative entry after proof, never a lagging observer's old payload.
  const data = readable ? cache.getQueryData<HostProjectDirectory | HostProject[]>(visibilityKey) : undefined;
  const directoryData = grouped ? data as HostProjectDirectory | undefined : undefined;
  const legacyData = !grouped ? data as HostProject[] | undefined : undefined;
  const readiness = getProjectDirectoryReadiness({
    readable,
    hasData: data !== undefined,
    grouped,
    privacyReady: directoryData?.privacyReady,
    isFetching: source.isFetching,
    error: source.error,
  });
  const directoryReady = readiness === "ready";
  const verifying = readiness === "loading";
  const privacyUnavailable = readiness === "sync-required";
  const visibleQuery = { ...source, data };
  // An invalidated cached success is not a successful empty directory. Expose
  // its real in-flight state while the private workspace remains concealed.
  const query = verifying || readiness === "waiting" || privacyUnavailable
    ? { ...visibleQuery, data: privacyUnavailable ? visibleQuery.data : undefined,
        status: "pending" as const, isPending: true,
        isLoading: verifying, isSuccess: false }
    : visibleQuery;
  const projects = useMemo<HostProjectDirectory["projects"]>(
    () =>
      !readable ? [] : grouped
        ? distinctDirectoryProjects(directoryData?.privacyReady ? directoryData.projects : [])
        : deduplicateProjects(legacyData ?? []).map((project) => ({
            ...project,
            registered: true,
          })),
    [readable, grouped, directoryData, legacyData],
  );
  const registered = useMemo(() => projects.filter((project) => project.registered), [projects]);
  const groups = useMemo(
    () => (readable && grouped && directoryData?.privacyReady ? directoryData.groups : []),
    [readable, grouped, directoryData],
  );
  const privacyPending = invalidated || denied || grouped && !!directoryData && !directoryData.privacyReady;
  const isProjectVisible = useCallback((projectId: string, expectedCwd?: string) => {
    if (!machine || !machineReadable(machine)) return false;
    const method = grouped ? "projects.directory" : "projects.list";
    const key = hostKey(machine.id, grouped ? ["projects", DIRECTORY_QUERY_KEY, { method, params: {} }] : ["projects", { method, params: {} }]);
    if (projectVisibilityExpired(cache, key) || projectVisibilityDenied(cache, key)) return false;
    if (grouped) {
      const data = cache.getQueryData<HostProjectDirectory>(key);
      return !!data?.privacyReady && data.projects.some((row) => row.id === projectId && row.registered && (expectedCwd === undefined || row.cwd === expectedCwd));
    }
    return cache.getQueryData<HostProject[]>(key)?.some((row) => row.id === projectId && (expectedCwd === undefined || row.cwd === expectedCwd)) === true;
  }, [machine?.id, machine?.environmentId, grouped, cache]);
  return { query, projects, registered, groups, grouped, privacyPending, readable, sync,
    readiness, directoryReady, verifying, privacyUnavailable, isProjectVisible };
}

/** Session/action lookups use host IDs; desktop-only folders require an explicit open first. */
export function useProjectList() {
  const directory = useProjectDirectory();
  return {
    ...directory.query,
    data: directory.query.data === undefined ? undefined : directory.registered,
    isSuccess: directory.readable && directory.query.isSuccess && !directory.privacyPending,
    privacyPending: directory.privacyPending,
    readable: directory.readable,
    readiness: directory.readiness,
    directoryReady: directory.directoryReady,
    verifying: directory.verifying,
    privacyUnavailable: directory.privacyUnavailable,
    isProjectVisible: directory.isProjectVisible,
  };
}
