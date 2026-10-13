import { useLocalSearchParams } from "expo-router";
import { ProjectScreen } from "../../src/features/workspace/project-screen";
import { useMachines } from "../../src/state/machines";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
export default function ProjectRoute() {
  const { id, machineId, cwd } = useLocalSearchParams<{
    id: string;
    machineId?: string;
    cwd?: string;
  }>();
  const active = useMachines((s) => s.activeId);
  return (
    <WorkspaceRouteScope machineId={machineId}>
      <ProjectScreen key={`${active}:${id}:${cwd ?? ""}`} id={id} initialCwd={cwd} />
    </WorkspaceRouteScope>
  );
}
