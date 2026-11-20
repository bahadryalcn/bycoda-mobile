import { useCopy } from "@/ui/copy";
import { ErrorNotice, SelectField } from "@/ui/primitives";
import { isConnectionLevelError } from "@/ui/error-message";
import { isTransientConnectionError } from "@/state/query-retry";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useProjectList } from "../../workspace/use-project-directory";

import type { ScopeProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function Scope({ allowAll = false, projectId, onChange }: ScopeProps) {
  const copy = useCopy();


  const projects = useProjectList();
  // A computer whose socket is down is the screen's state to report, not a second notice in the toolbar.
  const linkDown = useActiveHostLinkDown();
  // Loading is announced in the field itself: a sibling line would grow the toolbar row and drop its actions.
  // Until the directory is ready the field is disabled, so "Choose a project" would ask for the impossible.
  const loading = (projects.data === undefined && projects.isLoading) || !projects.directoryReady;
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
      {projects.error && !isConnectionLevelError(projects.error) && !(linkDown && isTransientConnectionError(projects.error)) ?<ErrorNotice error={projects.error} onRetry={() => { if (!projects.isFetching) void projects.refetch?.(); }}
        retrying={projects.isFetching} /> : null}
    </>
  );
}
