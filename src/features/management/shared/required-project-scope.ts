import { useProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import { useProjectList } from "../../workspace/use-project-directory";
import { lastSpecificProject, requiredProjectFallback, useLocalProjectScope, useScopeRevision } from "./local-project-scope";

/**
 * The shared project scope for a page that always needs one project (everything except Tasks,
 * Notes and Automations). A specific shared selection is used as is. While the selection is All
 * projects the page shows `requiredProjectFallback` without asking and without changing the shared
 * selection, so pages that accept All keep it; picking a project in the pill sets the selection.
 * A remembered selection that the computer's proven directory no longer lists (removed, or never
 * on this computer) is treated like All, so a page never reads a stale project after a computer
 * switch. `projectId` is null only while no project is known yet (directory loading, none registered).
 */
export function useRequiredProjectScope() {
  const scope = useLocalProjectScope();
  const machineId = scope.current.current.machineId;
  const projects = useProjectList();
  const { preferences } = useProjectDirectoryPreferences(machineId ?? undefined);
  const withdrawn = !!scope.projectId && projects.directoryReady && !!projects.data &&
    !projects.data.some((project) => project.id === scope.projectId);
  const selected = withdrawn ? null : scope.projectId;
  const fallback = selected ? undefined : requiredProjectFallback({
    projects: projects.directoryReady ? projects.data : undefined,
    last: lastSpecificProject(machineId),
    recent: preferences.recent,
  });
  const projectId = selected ?? fallback ?? null;
  const current = useScopeRevision(machineId, projectId);
  return {
    projectId,
    // All projects is not a choice here; the pill never offers it.
    setProjectId: (id: string | null) => {
      if (!id) return;
      scope.setProjectId(id);
      // Like the shared hook: an accepted write retires results captured for the previous scope.
      if (scope.current.current.projectId === id) current.current = { machineId, projectId: id, revision: current.current.revision + 1 };
    },
    current,
    revision: current.current.revision,
    /** The page shows a fallback project; the shared selection is still All projects. */
    fallback: !selected && !!projectId,
  };
}
