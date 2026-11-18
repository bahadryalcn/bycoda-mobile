import { useCopy } from "@/ui/copy";
import { ErrorNotice, SelectField } from "@/ui/primitives";
import { isConnectionLevelError } from "@/ui/error-message";
import { useProjectList } from "../../workspace/use-project-directory";

import type { ScopeProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function Scope({ allowAll = false, projectId, onChange }: ScopeProps) {
  const copy = useCopy();


  const projects = useProjectList();
  // Loading is announced in the field itself: a sibling line would grow the toolbar row and drop its actions.
  const loading = projects.data === undefined && projects.isLoading;
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
        placeholder={loading ? copy("Projeler yükleniyor…", "Loading projects…") : copy("Proje seçin", "Choose a project")}
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
      {/* A lost or revoked connection is the screen's state to report; the filter only waits. */}
      {projects.error && !isConnectionLevelError(projects.error) ? <ErrorNotice error={projects.error} onRetry={() => { if (!projects.isFetching) void projects.refetch?.(); }}
        retrying={projects.isFetching} /> : null}
    </>
  );
}
