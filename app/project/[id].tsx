import { useLocalSearchParams } from "expo-router";
import { ProjectScreen } from "../../src/features/workspace/project-screen";
import { useMachines } from "../../src/state/machines";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
export default function ProjectRoute() {
  const { id, machineId, cwd, view, create } = useLocalSearchParams<{
    id: string;
    machineId?: string;
    cwd?: string;
    view?: string;
    create?: string;
  }>();
  const active = useMachines((s) => s.activeId);
  return (
    <WorkspaceRouteScope machineId={machineId}>
      <ProjectScreen
        key={`${active}:${id}:${cwd ?? ""}:${view ?? ""}:${create ?? ""}`}
        id={id}
        initialCwd={cwd}
        initialSegment={view === "files" || view === "git" ? view : "sessions"}
        initialCreateSession={create === "session"}
      />
    </WorkspaceRouteScope>
  );
}
