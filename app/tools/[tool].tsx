import { Stack, useLocalSearchParams } from "expo-router";
import { HostToolScreen } from "../../src/features/tools";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
import { useMachines } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";
import { Screen } from "../../src/ui/primitives";
import { NoComputerGate } from "../../src/ui/no-computer";
import { isToolId, toolLabels } from "../../src/features/tools/tool-labels";


export default function HostToolRoute() {
  const { tool, projectId, machineId } = useLocalSearchParams<{ tool: string; projectId?: string; machineId?: string }>();
  const active = useMachines((state) => state.activeId);
  const copy = useCopy();
  // Same labels as the tool directory, so the native title is right before the screen mounts.
  const title = isToolId(tool ?? "") ? toolLabels[tool as keyof typeof toolLabels] : undefined;
  // No computer at all: keep the tool's own title and show the shared connect state.
  if (!active && !machineId) return (
    <Screen title={title ? copy(...title) : copy("Araçlar", "Tools")} scroll={false}>
      {title ? <Stack.Screen options={{ title: copy(...title) }} /> : null}
      <NoComputerGate />
    </Screen>
  );
  return (
    <WorkspaceRouteScope machineId={machineId}>
      {title ? <Stack.Screen options={{ title: copy(...title) }} /> : null}
      <HostToolScreen key={`${active}:${projectId ?? ""}:${tool}`} tool={tool} projectId={projectId} />
    </WorkspaceRouteScope>
  );
}
