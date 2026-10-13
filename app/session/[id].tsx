import { useLocalSearchParams } from "expo-router";
import { SessionScreen } from "../../src/features/workspace/session-screen";
import { useMachines } from "../../src/state/machines";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
export default function SessionRoute() {
  const { id, projectId, machineId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
    machineId?: string;
  }>();
  const active = useMachines((s) => s.activeId);
  return (
    <WorkspaceRouteScope machineId={machineId}>
      <SessionScreen key={`${active}:${id}`} id={id} projectId={projectId} />
    </WorkspaceRouteScope>
  );
}
