import { useQueries, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { readProjectSummaries, type ProjectSummaries } from "./project-summaries";
import { activeProjectSessions } from "./activity-model";
import { useProjectList } from "./use-project-directory";

export function useProjectActivity() {
  const machine = useActiveMachine();
  const client = useHostClient();
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
        enabled: !!client,
        retry: false,
        staleTime: 5_000,
        refetchInterval: 10_000,
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
  const sessions = activeProjectSessions(
    projects.data ?? [],
    queries.map((query) => query.data),
  );
  return {
    projects,
    sessions,
    complete:
      projects.isSuccess &&
      queries.every(
        (query, index) =>
          query.isSuccess &&
          !query.data?.limited &&
          groups[index]!.every((id) => query.data?.projects[id]),
      ),
    pending: projects.isPending || queries.some((query) => query.isPending),
    refreshing: projects.isFetching || queries.some((query) => query.isFetching),
    privacyPending: projects.privacyPending,
    error: projects.error ?? queries.find((query) => query.error)?.error,
    refetch: async () => {
      await projects.refetch();
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}
