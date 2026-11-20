import { useSyncExternalStore } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey } from "@/state/queries";
import { Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { ProviderInboxDetail } from "../../inbox/provider-detail";
import { useProviderInboxAvailability } from "../../inbox/provider-queries";
import type { RemoteInboxItem, RemoteInboxList } from "../../../../../src/features/inbox/model/remoteInbox";
import { matchPrItem, readPrRoute, type PrRouteTarget } from "../model/list";
import { InboxLocalScopeContext } from "../../inbox/inbox-local-scope";
import { useProjectList } from "../../workspace/use-project-directory";

export function PullRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; repo?: string; projectPath?: string; machineId?: string; projectId?: string }>();
  const machine = useActiveMachine(), projectId = params.projectId || null, copy = useCopy();
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const target = readPrRoute(params);
  const item = useCachedPrItem(machine?.id ?? null, projectId, target);
  if (!machine || machine.id !== params.machineId || projectId && !projects.isProjectVisible(projectId)) return <Screen><StateView illustration="unreachable" title={copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")} /></Screen>;
  if (!item) return <Screen><StateView illustration="unreachable" title={copy("Pull request açılamadı", "Could not open pull request")} /></Screen>;
  return <InboxLocalScopeContext value={{ projectId, setProjectId: () => {}, matches: origin => useMachines.getState().activeId === origin.machineId && origin.machineId === params.machineId && origin.projectId === projectId && (!projectId || projects.isProjectVisible(projectId)) }}>
    <Stack.Screen options={{ title: copy("Pull request", "Pull request") }} /><ProviderInboxDetail key={`${machine.id}:${projectId}:${item.repo}:${item.number}`} item={item} origin={{ machineId: machine.id, projectId }} availability={availability} onClose={() => router.back()} />
  </InboxLocalScopeContext>;
}

/** The tapped row lives in the list cache of this machine and project; the route carries identity only. */
function useCachedPrItem(machineId: string | null, projectId: string | null, target: PrRouteTarget | null): RemoteInboxItem | null {
  const cache = useQueryClient();
  return useSyncExternalStore(
    notify => cache.getQueryCache().subscribe(notify),
    () => findCachedPrItem(cache, machineId, projectId, target),
  );
}

function findCachedPrItem(cache: QueryClient, machineId: string | null, projectId: string | null, target: PrRouteTarget | null): RemoteInboxItem | null {
  if (!machineId || !target) return null;
  for (const [key, list] of cache.getQueriesData<RemoteInboxList>({ queryKey: hostKey(machineId, ["provider-inbox", "list"]) })) {
    // Cache key: [machine, id, "provider-inbox", "list", input]; a list without projectId is the all-projects scope.
    const input = key[4] as { projectId?: string } | undefined;
    if ((input?.projectId ?? null) !== projectId) continue;
    const found = matchPrItem(list?.items, target);
    if (found) return found;
  }
  return null;
}
