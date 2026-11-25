import { useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { HostToolScreen } from "../../src/features/tools";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
import { useAdoptProjectScope } from "../../src/features/management/shared/local-project-scope";
import { useRequiredProjectScope } from "../../src/features/management/shared/required-project-scope";
import { ProjectScopePill } from "../../src/features/workspace/project-scope-pill";
import { useMachines } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";
import { Screen } from "../../src/ui/primitives";
import { ScreenScopeControl } from "../../src/ui/screen-chrome";
import { NoComputerGate } from "../../src/ui/no-computer";
import { computerTools, isToolId, toolLabels } from "../../src/features/tools/tool-labels";


export default function HostToolRoute() {
  const { tool, projectId, machineId } = useLocalSearchParams<{ tool: string; projectId?: string; machineId?: string }>();
  const active = useMachines((state) => state.activeId);
  const copy = useCopy();
  // A link for one project sets the shared selection; the tool then follows the shared pill.
  useAdoptProjectScope(projectId || undefined, machineId);
  // Every tool reads one project; All projects falls back to the last or most recent project.
  const scope = useRequiredProjectScope();
  const shared = scope.projectId ?? undefined;
  // Computer-level tools carry the switchable computer pill: opened on the active computer they
  // follow it (and remount for the new computer). Project tools and links for another computer
  // stay bound to their computer.
  const computerLevel = computerTools.has(tool ?? "") || tool === "providers" || tool === "access";
  const [followsActive] = useState(() => computerLevel && (!machineId || machineId === active));
  // Same labels as the tool directory, so the native title is right before the screen mounts.
  const title = isToolId(tool ?? "") ? toolLabels[tool as keyof typeof toolLabels] : undefined;
  // No computer at all: keep the tool's own title and show the shared connect state.
  if (!active && !machineId) return (
    <Screen title={title ? copy(...title) : copy("Araçlar", "Tools")} scroll={false}>
      {title ? <Stack.Screen options={{ title: copy(...title) }} /> : null}
      <NoComputerGate />
    </Screen>
  );
  const pill = <ProjectScopePill allowAll={false} projectId={scope.projectId} onChange={scope.setProjectId} />;
  // A project tool's pages (and their loading or recovery states) show the shared project pill in
  // their scope row; computer-level tools place it themselves or not at all.
  const projectTool = !computerLevel;
  const body = (
    <ScreenScopeControl value={projectTool ? pill : undefined}>
      {title ? <Stack.Screen options={{ title: copy(...title) }} /> : null}
      {/* Usage keeps its tab across a project change; project tools remount for the new project. */}
      <HostToolScreen key={computerLevel ? `${active}:${tool}` : `${active}:${shared ?? ""}:${tool}`} tool={tool} projectId={shared}
        onSelectProject={scope.setProjectId}
        scopeControl={pill} />
    </ScreenScopeControl>
  );
  // Usage is computer-level and carries the shared computer pill, so once open on the active
  // computer it follows that pill; a link for another computer stays held back like every tool.
  if (followsActive) return body;
  return <WorkspaceRouteScope machineId={machineId}>{body}</WorkspaceRouteScope>;
}
