import { useLocalSearchParams } from "expo-router";
import { SessionScreen } from "../../src/features/workspace/session-screen";
import { useMachines } from "../../src/state/machines";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
export default function SessionRoute() {
  const { id, projectId, machineId, targetTurnId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
    machineId?: string;
    targetTurnId?: string;
  }>();
  const active = useMachines((s) => s.activeId);
  return (
    <WorkspaceRouteScope machineId={machineId}>
      <SessionScreen
        key={`${active}:${id}:${projectId ?? ""}:${targetTurnId ?? ""}`}
        id={id}
        projectId={projectId}
        targetTurnId={targetTurnId}
      />
    </WorkspaceRouteScope>
  );
}
