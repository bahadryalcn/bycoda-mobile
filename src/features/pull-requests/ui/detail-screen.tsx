import { useSyncExternalStore } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey } from "@/state/queries";
import { Screen, Skeleton, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { ProviderInboxDetail } from "../../inbox/provider-detail";
import { useInboxRead, useProviderInboxAvailability } from "../../inbox/provider-queries";
import { providerInboxAccess } from "../../inbox/provider-model";
import type { RemoteInboxItem, RemoteInboxList } from "../../../../../src/features/inbox/model/remoteInbox";
import { defaultPrFilters, matchPrItem, prListQuery, readPrRoute, type PrRouteTarget } from "../model/list";
import { InboxLocalScopeContext } from "../../inbox/inbox-local-scope";
import { useProjectList } from "../../workspace/use-project-directory";

export function PullRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; repo?: string; projectPath?: string; machineId?: string; projectId?: string }>();
  const machine = useActiveMachine(), projectId = params.projectId || null, copy = useCopy();
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const target = readPrRoute(params);
  const scopeCurrent = machine?.id === params.machineId && (!projectId || projects.isProjectVisible(projectId));
  const verifiedMachine = scopeCurrent ? machine : null;
  const item = useCachedPrItem(verifiedMachine?.id ?? null, projectId, target);
  // Deep link or cold start: nothing is cached yet, so run the list's own default read for this
  // scope. Its result lands in the same list cache the row lookup above already watches.
  const coldRead = !!verifiedMachine && !!target && !item && providerInboxAccess(availability).canRead;
  const listRead = useInboxRead({ action: "list", input: { ...(projectId ? { projectId } : {}), query: prListQuery(defaultPrFilters) } }, coldRead);
  const title = copy("Pull request", "Pull request");
  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (verifiedMachine && useMachines.getState().activeId === verifiedMachine.id &&
      (!projectId || projects.isProjectVisible(projectId))) {
      router.replace({ pathname: "/pull-requests", params: { machineId: verifiedMachine.id, projectId: projectId ?? "" } });
    } else {
      router.replace("/");
    }
  };
  // A cold start (notification, deep link) proves the project and desktop provider access first;
  // until those reads answer, an "unavailable" verdict would only flash before the PR opens.
  const directoryLoading = !!machine && machine.id === params.machineId && !!projectId && projects.verifying === true;
  const availabilityLoading = !!verifiedMachine && !!target && !item && availability.data === undefined && !availability.error && availability.isFetching;
  if (directoryLoading || availabilityLoading || (coldRead && listRead.data === undefined && !listRead.error)) return <>
    <Stack.Screen options={{ title }} />
    <Screen><Skeleton /></Screen>
  </>;
  // When the read itself failed or desktop provider access is off, say that instead of a generic hint.
  const missingCause = !verifiedMachine || !target ? undefined
    : listRead.error ? errorMessage(listRead.error, copy, undefined, { read: true })
    : availability.error ? errorMessage(availability.error, copy, undefined, { read: true })
    : availability.data?.available === false ? copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
      "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")
    : undefined;
  if (!verifiedMachine || !item) return <>
    <Stack.Screen options={{ title }} />
    <Screen>
      <StateView
        size="region"
        tone="warning"
        title={verifiedMachine ? copy("Pull request açılamadı", "Could not open pull request") : copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")}
        description={missingCause ?? (verifiedMachine && target ? copy("Pull request listesinden aç.", "Open it from the pull request list.") : undefined)}
        action={{
          label: router.canGoBack() ? copy("Geri dön", "Go back") : verifiedMachine ? copy("Pull request’ler", "Pull requests") : copy("Projeler", "Projects"),
          onPress: close,
        }}
      />
    </Screen>
  </>;
  return <InboxLocalScopeContext value={{ projectId, setProjectId: () => {}, matches: origin => useMachines.getState().activeId === origin.machineId && origin.machineId === params.machineId && origin.projectId === projectId && (!projectId || projects.isProjectVisible(projectId)) }}>
    <Stack.Screen options={{ title }} />
    <ProviderInboxDetail key={`${verifiedMachine.id}:${projectId}:${item.repo}:${item.number}`} item={item} origin={{ machineId: verifiedMachine.id, projectId }} availability={availability} onClose={close} />
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
