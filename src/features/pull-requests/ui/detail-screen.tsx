import { router, Stack, useLocalSearchParams } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { ProviderInboxDetail } from "../../inbox/provider-detail";
import { useProviderInboxAvailability } from "../../inbox/provider-queries";
import { readPrRoute } from "../model/list";
import { InboxLocalScopeContext } from "../../inbox/inbox-local-scope";
import { useProjectList } from "../../workspace/use-project-directory";

export function PullRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; item?: string; machineId?: string; projectId?: string }>();
  const machine = useActiveMachine(), projectId = params.projectId || null, copy = useCopy();
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const item = readPrRoute(params.item, params.id);
  if (!item || !machine || machine.id !== params.machineId || projectId && !projects.isProjectVisible(projectId)) return <Screen><StateView illustration="unreachable" title={copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")} /></Screen>;
  return <InboxLocalScopeContext value={{ projectId, setProjectId: () => {}, matches: origin => useMachines.getState().activeId === origin.machineId && origin.machineId === params.machineId && origin.projectId === projectId && (!projectId || projects.isProjectVisible(projectId)) }}>
    <Stack.Screen options={{ title: copy("Pull request", "Pull request") }} /><ProviderInboxDetail key={`${machine.id}:${projectId}:${item.repo}:${item.number}`} item={item} origin={{ machineId: machine.id, projectId }} availability={availability} onClose={() => router.back()} />
  </InboxLocalScopeContext>;
}
