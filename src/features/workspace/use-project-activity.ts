import { useQueries, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { readProjectSummaries, type ProjectSummaries } from "./project-summaries";
import { projectSessionDirectory } from "./activity-model";
import { useProjectList } from "./use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";

export function useProjectActivity() {
  const machine = useActiveMachine();
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const projects = useProjectList();
  const ids = (projects.data ?? []).map((project) => project.id).sort();
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += 32) groups.push(ids.slice(i, i + 32));
  const queries = useQueries({
    queries: groups.map((projectIds) => {
      const queryKey = hostKey(machine?.id ?? null, ["project-summaries", projectIds]);
      return {
        queryKey,
        enabled: !!client && active && projects.directoryReady,
        retry: false,
        staleTime: 5_000,
        refetchInterval: (query: { state: { error: unknown } }) =>
          ["auth", "identity", "unsupported"].includes(remoteErrorKind(query.state.error) ?? "") ? false : 5_000,
        networkMode: "always" as const,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          readProjectSummaries(
            client!,
            projectIds,
            cache.getQueryData<ProjectSummaries>(queryKey),
            machine?.capabilities?.includes("machine.changes") ?? true,
            { signal },
          ),
      };
    }),
  });
  const accessError = queries.find((query) => ["auth", "identity"].includes(remoteErrorKind(query.error) ?? ""))?.error;
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
    error: projects.error ?? accessError ?? queries.find((query) => query.error)?.error,
    refetch: async () => {
      await projects.refetch();
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}
