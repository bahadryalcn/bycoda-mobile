import { useCopy } from "@/ui/copy";
import { SelectField } from "@/ui/primitives";
import { ProjectDirectoryFeedback } from "../../workspace/project-directory-feedback";
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
        disabled={!projects.directoryReady}
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
        onChange={(id) => {
          if (!projects.directoryReady || id && !projects.isProjectVisible(id)) return;
          selectProject(id || null);
        }}
      />
      <ProjectDirectoryFeedback query={projects} readiness={projects.readiness}
        privacyUnavailable={projects.privacyUnavailable} loading="inline"
        loadingLabel={copy("Projeler yükleniyor…", "Loading projects…")} />
    </>
  );
}
