import { useLocalSearchParams } from "expo-router";
import { HostToolScreen } from "../../src/features/tools";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
import { useMachines } from "../../src/state/machines";

export default function HostToolRoute() {
  const { tool, projectId, machineId } = useLocalSearchParams<{ tool: string; projectId?: string; machineId?: string }>();
  const active = useMachines((state) => state.activeId);
  return (
    <WorkspaceRouteScope machineId={machineId}>
      <HostToolScreen key={`${active}:${projectId ?? ""}:${tool}`} tool={tool} projectId={projectId} />
    </WorkspaceRouteScope>
  );
}
