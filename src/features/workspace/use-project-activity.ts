import { useQueries, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { readProjectSummaries, type ProjectSummaries } from "./project-summaries";
import { projectSessionDirectory } from "./activity-model";
import { useProjectList } from "./use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";
import { useEffect, useRef, useState } from "react";
import { watchProjectStream } from "@/remote/session-sync";
import type { MobileStreamSubscription } from "@/remote/host-transport";
import { RemoteHostError } from "@/remote/host-error";

export function useProjectActivity() {
  const machine = useActiveMachine();
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const projects = useProjectList();
  const ids = (projects.data ?? []).map((project) => project.id).sort();
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += 32) groups.push(ids.slice(i, i + 32));
  const streaming =
    !!client && active && projects.directoryReady && (client.supportsStreams?.() ?? false);
  const liveIds = ids.slice(0, 32);
  const liveIdentity = JSON.stringify([machine?.id, liveIds]);
  const liveAccess = useRef({ enabled: streaming, identity: liveIdentity });
  liveAccess.current = { enabled: streaming, identity: liveIdentity };
  const [streamError, setStreamError] = useState<Error | undefined>();
  useEffect(() => {
    if (!streaming || !client || !liveIds.length) {
      setStreamError(undefined);
      return;
    }
    let disposed = false;
    const subscriptions: MobileStreamSubscription[] = [];
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
      void watchProjectStream(
        client,
        projectId,
        async (value, assertCurrent) => {
          current();
          assertCurrent();
          await cache.cancelQueries({ queryKey, exact: true }, { silent: true, revert: false });
          current();
          assertCurrent();
          cache.setQueryData<ProjectSummaries>(queryKey, (current) => ({
            ...current,
            projects: { ...current?.projects, [projectId]: value },
          }));
          setStreamError(undefined);
        },
        (error) => {
          if (!disposed) setStreamError(error);
        },
      )
        .then((subscription) => {
          if (disposed) subscription.close();
          else subscriptions.push(subscription);
        })
        .catch((error) => {
          if (!disposed)
            setStreamError(
              error instanceof Error ? error : new Error("The project stream could not be opened."),
            );
        });
    return () => {
      disposed = true;
      for (const subscription of subscriptions) subscription.close();
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
        refetchInterval: (query: { state: { error: unknown } }) =>
          liveGroup ||
          ["auth", "identity", "unsupported"].includes(remoteErrorKind(query.state.error) ?? "")
            ? false
            : 5_000,
        networkMode: "always" as const,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          readProjectSummaries(
            client!,
            projectIds,
            cache.getQueryData<ProjectSummaries>(queryKey),
            liveGroup ? false : (machine?.capabilities?.includes("machine.changes") ?? true),
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
      projects.error ?? accessError ?? streamError ?? queries.find((query) => query.error)?.error,
    refetch: async () => {
      await projects.refetch();
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}
