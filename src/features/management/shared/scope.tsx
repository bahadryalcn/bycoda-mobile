import { useCopy } from "@/ui/copy";
import { ErrorNotice, Loading, SelectField } from "@/ui/primitives";
import { useProjectList } from "../../workspace/use-project-directory";

import type { ScopeProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function Scope({ allowAll = false, projectId, onChange }: ScopeProps) {
  const copy = useCopy();


  const projects = useProjectList();
  const options = deduplicateProjects(projects.data ?? [], projectId).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  return (
    <>
      <SelectField
        label={copy("Proje filtresi", "Project filter")}
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
          onChange(id || null);
        }}
      />
      {/* Field-level feedback stays one compact line: a full StateView here would stretch the
          toolbar row (sliding its actions) and compete with the screen's own state. */}
      {projects.error ? <ErrorNotice error={projects.error} onRetry={() => { if (!projects.isFetching) void projects.refetch?.(); }}
        retrying={projects.isFetching} /> : projects.data === undefined && projects.isLoading ? <Loading
        label={copy("Projeler yükleniyor…", "Loading projects…")} /> : null}
    </>
  );
}
