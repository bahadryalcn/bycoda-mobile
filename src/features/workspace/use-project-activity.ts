import { useQueries, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { readProjectSummaries, type ProjectSummaries } from "./project-summaries";
import { projectSessionDirectory } from "./activity-model";
import { useProjectList } from "./use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";
import { useEffect, useMemo, useRef, useState } from "react";
import { backoffMs } from "./session-read-schedule";
import { retainProjectStream } from "@/remote/project-stream-hub";
import { RemoteHostError } from "@/remote/host-error";
import { isTransientConnectionError } from "@/state/query-retry";

/** 5s while healthy; doubles per consecutive failure up to 60s. Resets when a read succeeds. */
export function activityPollDelay(failures: number) {
  return backoffMs(5_000, failures - 1, 60_000);
}

export function useProjectActivity() {
  const machine = useActiveMachine();
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const projects = useProjectList();
  const idKey = (projects.data ?? []).map((project) => project.id).sort().join("\n");
  const { ids, groups, liveIds } = useMemo(() => {
    const ids = idKey ? idKey.split("\n") : [];
    const groups: string[][] = [];
    for (let i = 0; i < ids.length; i += 32) groups.push(ids.slice(i, i + 32));
    return { ids, groups, liveIds: ids.slice(0, 32) };
  }, [idKey]);
  const streaming =
    !!client && active && projects.directoryReady && (client.supportsStreams?.() ?? false);
  const liveIdentity = JSON.stringify([machine?.id, liveIds]);
  const liveAccess = useRef({ enabled: streaming, identity: liveIdentity });
  liveAccess.current = { enabled: streaming, identity: liveIdentity };
  const [streamError, setStreamError] = useState<Error | undefined>();
  // While the live stream is failing, the 5s summary poll takes over.
  const streamFailing = useRef(false);
  useEffect(() => {
    if (!streaming || !client || !liveIds.length) {
      streamFailing.current = false;
      setStreamError(undefined);
      return;
    }
    let disposed = false;
    const releases: (() => void)[] = [];
    const queryKey = hostKey(machine?.id ?? null, ["project-summaries", liveIds]);
    const current = () => {
      client.assertCurrentAccess();
      if (disposed || !liveAccess.current.enabled || liveAccess.current.identity !== liveIdentity)
        throw new RemoteHostError(
          machine?.id ?? "",
          "auth",
          "The project directory is unavailable.",
        );
    };
    for (const projectId of liveIds)
      releases.push(
        retainProjectStream(client, projectId, {
          apply: async (value, assertCurrent) => {
            current();
            assertCurrent();
            await cache.cancelQueries({ queryKey, exact: true }, { silent: true, revert: false });
            current();
            assertCurrent();
            // Sibling consumers receive the same object; the first write wins.
            cache.setQueryData<ProjectSummaries>(queryKey, (previous) =>
              previous?.projects?.[projectId] === value
                ? previous
                : { ...previous, projects: { ...previous?.projects, [projectId]: value } },
            );
            streamFailing.current = false;
            setStreamError(undefined);
          },
          onError: (error) => {
            if (disposed) return;
            streamFailing.current = true;
            setStreamError(error);
          },
        }),
      );
    return () => {
      disposed = true;
      for (const release of releases) release();
    };
    // The stable identity includes the exact sorted project demand; the first
    // 32 reserve room for the mounted transcript within the 64-stream budget.
  }, [streaming, client, cache, liveIdentity]);
  const queries = useQueries({
    queries: groups.map((projectIds, groupIndex) => {
      const liveGroup = streaming && groupIndex === 0;
      const queryKey = hostKey(machine?.id ?? null, ["project-summaries", projectIds]);
      return {
        queryKey,
        enabled: !!client && active && projects.directoryReady,
        retry: false,
        staleTime: 5_000,
        refetchInterval: (query: { state: { data?: unknown; error: unknown; fetchFailureCount?: number } }) =>
          (liveGroup && !streamFailing.current) ||
          ["auth", "identity", "unsupported"].includes(remoteErrorKind(query.state.error) ?? "")
            ? false
            : query.state.data === undefined && isTransientConnectionError(query.state.error)
              // Leave room for the visible reader's quiet reconnect before the background poll.
              ? 30_000
              : activityPollDelay(query.state.fetchFailureCount ?? 0),
        networkMode: "always" as const,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          readProjectSummaries(
            client!,
            projectIds,
            cache.getQueryData<ProjectSummaries>(queryKey),
            // One batched read for every group, the live one included: 32 per-project
            // sessions.list reads per poll (cancelled again by each stream event, while the
            // Host keeps running them) filled the Host's per-device read slots ("busy").
            // A stream-applied baseline that does not match falls back to a fresh read.
            machine?.capabilities?.includes("machine.changes") ?? true,
            { signal },
          ),
      };
    }),
  });
  const accessError = ["auth", "identity"].includes(remoteErrorKind(streamError) ?? "")
    ? streamError
    : queries.find((query) => ["auth", "identity"].includes(remoteErrorKind(query.error) ?? ""))
        ?.error;
  const directory = projectSessionDirectory(
    projects.data ?? [],
    accessError ? [] : queries.map((query) => query.data),
  );
  // The fallback read owns transient recovery, including the split view's shared retry.
  const reportedStreamError = isTransientConnectionError(streamError) ? undefined : streamError;
  return {
    projects,
    directory,
    sessions: directory.filter(
      ({ session }) => !session.archived && (session.status === "running" || session.needsInput),
    ),
    complete:
      projects.directoryReady &&
      queries.every(
        (query, index) =>
          query.isSuccess &&
          !query.data?.limited &&
          !query.data?.failed?.length &&
          groups[index]!.every((id) => query.data?.projects[id]),
      ),
    pending: projects.verifying || queries.some((query) => query.isLoading),
    refreshing: projects.isFetching || queries.some((query) => query.isFetching),
    privacyPending: projects.privacyPending,
    privacyUnavailable: projects.privacyUnavailable,
    directoryReady: projects.directoryReady,
    verifying: projects.verifying,
    readiness: projects.readiness,
    error:
      projects.error ?? accessError ?? reportedStreamError ?? queries.find((query) => query.error)?.error,
    refetch: async () => {
      await projects.refetch();
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}
