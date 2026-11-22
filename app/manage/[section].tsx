import { Stack, useLocalSearchParams } from "expo-router";
import { ManagementScreen } from "../../src/features/management";
import { useActiveMachine } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";
import { isManagementSection, managementSections } from "../../src/features/management/sections";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";

export default function ManagementRoute() {
  const { section, machineId, environmentId, projectFilter, projectId, taskId } = useLocalSearchParams<{
    section: string; machineId?: string; environmentId?: string; projectFilter?: string; projectId?: string; taskId?: string;
  }>();
  const machine = useActiveMachine();
  const ownsFilter = !!machine && machine.id === machineId && machine.environmentId === environmentId;
  const requestedProjectId = projectFilter === "all" ? null : projectFilter === "project" ? projectId : undefined;
  const initialProjectId = ownsFilter ? requestedProjectId : undefined;
  const copy = useCopy();
  const title = isManagementSection(section)
    ? copy(managementSections[section][0], managementSections[section][1])
    : copy("Bölüm bulunamadı", "Section not found");
  const screen = <ManagementScreen key={`${machine?.id}:${section}`} section={section} initialProjectId={initialProjectId} />;
  return (
    <>
      <Stack.Screen
        options={{ title }}
      />
      {section === "tasks" && taskId && machineId
        ? <WorkspaceRouteScope machineId={machineId}>{screen}</WorkspaceRouteScope>
        : screen}
    </>
  );
}
