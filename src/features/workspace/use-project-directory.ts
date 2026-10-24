import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { hashKey, notifyManager, useQueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey, useHostClient, useHostQuery } from "@/state/queries";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { hasProviderPermission } from "../privacy/consent-access";
import type { HostProject, HostProjectDirectory } from "@/domain/types";
import { deduplicateProjects } from "./activity-model";
import { distinctDirectoryProjects } from "./project-directory";
import { getProjectDirectoryReadiness } from "./project-readiness";
import { invalidateProjectPrivacy, projectPrivacyKey } from "./project-privacy-cache";
const DIRECTORY_QUERY_KEY = "directory";

export function useProjectDirectory() {
  const machine = useActiveMachine();
  const client = useHostClient();
  const access = useSecurity((state) => state.status === "unlocked" && state.appState === "active" && state.windowFocused);
  const cache = useQueryClient();
  const grouped = !!machine?.capabilities?.includes("projects.directory.v1");
  const visibilityKey = useMemo(() => projectPrivacyKey(machine?.id ?? "", grouped), [machine?.id, grouped]);
  const visibilityHash = useMemo(() => hashKey(visibilityKey), [visibilityKey]);
  const subscribe = useCallback((notify: () => void) => {
    const schedule = notifyManager.batchCalls(notify);
    return cache.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== visibilityHash ||
        event.type !== "updated" && event.type !== "added" && event.type !== "removed") return;
      // Query observers can be constructed during another consumer's render.
      // Only directory state changes matter; use React Query's scheduling for
      // restored proof, but conceal invalidated proof immediately.
      if (event.type === "updated" && event.query.state.isInvalidated) notify();
      else schedule();
    });
  }, [cache, visibilityHash]);
  const invalidated = useSyncExternalStore(subscribe, () => cache.getQueryState(visibilityKey)?.isInvalidated === true, () => true);
  const readable = !!client && access && !invalidated;
  useEffect(() => {
    if ((!client || !access) && machine?.id && cache.getQueryState(visibilityKey) && !invalidated)
      void invalidateProjectPrivacy(cache, machine.id);
  }, [client, access, cache, visibilityKey, invalidated, machine?.id]);
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
    { interval: 15_000, enabled: grouped },
  );
  const source = grouped ? directory : legacy;
  const readiness = getProjectDirectoryReadiness({
    readable,
    hasData: source.data !== undefined,
    grouped,
    privacyReady: directory.data?.privacyReady,
    isFetching: source.isFetching,
    error: source.error,
  });
  const directoryReady = readiness === "ready";
  const verifying = readiness === "loading";
  const privacyUnavailable = readiness === "sync-required";
  const visibleQuery = readable ? source : { ...source, data: undefined };
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
        ? distinctDirectoryProjects(directory.data?.privacyReady ? directory.data.projects : [])
        : deduplicateProjects(legacy.data ?? []).map((project) => ({
            ...project,
            registered: true,
          })),
    [readable, grouped, directory.data, legacy.data],
  );
  const registered = useMemo(() => projects.filter((project) => project.registered), [projects]);
  const groups = useMemo(
    () => (readable && grouped && directory.data?.privacyReady ? directory.data.groups : []),
    [readable, grouped, directory.data],
  );
  const privacyPending = invalidated || grouped && !!directory.data && !directory.data.privacyReady;
  const isProjectVisible = useCallback((projectId: string) => {
    const state = useMachines.getState(); const security = useSecurity.getState(); const current = state.machines.find((row) => row.id === machine?.id);
    if (!machine || state.activeId !== machine.id || !state.hydrated || state.storageError || state.connectionPending || !current ||
      current.environmentId !== machine.environmentId || security.status !== "unlocked" || security.appState !== "active" || !security.windowFocused || !isAppAccessAllowed() || !hasProviderPermission(current)) return false;
    const method = grouped ? "projects.directory" : "projects.list";
    const key = hostKey(machine.id, grouped ? ["projects", DIRECTORY_QUERY_KEY, { method, params: {} }] : ["projects", { method, params: {} }]);
    const queryState = cache.getQueryState(key);
    if (queryState?.isInvalidated || ["auth", "identity"].includes((queryState?.error as { kind?: string } | null)?.kind ?? "")) return false;
    if (grouped) {
      const data = cache.getQueryData<HostProjectDirectory>(key);
      return !!data?.privacyReady && data.projects.some((row) => row.id === projectId && row.registered);
    }
    return cache.getQueryData<HostProject[]>(key)?.some((row) => row.id === projectId) === true;
  }, [machine?.id, machine?.environmentId, grouped, cache]);
  return { query, projects, registered, groups, grouped, privacyPending, readable,
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
