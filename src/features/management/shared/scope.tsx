import { useCopy } from "@/ui/copy";
import { Notice, QueryState, SelectField } from "@/ui/primitives";
import { useProjectList } from "../../workspace/use-project-directory";
import { useMachines } from "@/state/machines";
import type { ScopeProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function Scope({ allowAll = false }: ScopeProps) {
  const copy = useCopy();
  const projectId = useMachines((state) => state.selectedProjectId);
  const selectProject = useMachines((state) => state.selectProject);
  const projects = useProjectList();
  const options = deduplicateProjects(projects.data ?? [], projectId).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  return (
    <>
      <SelectField
        label={copy("Proje", "Project")}
        compact
        hideLabel
        disabled={projects.privacyPending}
        value={
          projectId && options.some((option) => option.value === projectId)
            ? projectId
            : !projectId && allowAll
              ? ""
              : undefined
        }
        placeholder={copy("Proje seçin", "Choose a project")}
        options={
          allowAll
            ? [{ value: "", label: copy("Tüm projeler", "All projects") }, ...options]
            : options
        }
        onChange={(id) => selectProject(id || null)}
      />
      <QueryState query={projects} loading="none" />
      {projects.privacyPending ? (
        <Notice
          tone="info"
          message={copy(
            "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
            "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
          )}
        />
      ) : null}
    </>
  );
}
