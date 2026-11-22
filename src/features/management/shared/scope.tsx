import { useCopy } from "@/ui/copy";
import { ErrorNotice, SelectField } from "@/ui/primitives";
import { isConnectionLevelError } from "@/ui/error-message";
import { isTransientConnectionError } from "@/state/query-retry";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useProjectList } from "../../workspace/use-project-directory";
import { ProjectDirectoryFeedback } from "../../workspace/project-directory-feedback";

import type { ScopeProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function Scope({ allowAll = false, projectId, onChange }: ScopeProps) {
  const copy = useCopy();


  const projects = useProjectList();
  // A computer whose socket is down is the screen's state to report, not a second notice in the toolbar.
  const linkDown = useActiveHostLinkDown();
  if (projects.privacyUnavailable && !linkDown && !projects.error)
    return <ProjectDirectoryFeedback compact query={projects} readiness={projects.readiness} privacyUnavailable />;
  const options = projects.directoryReady ? deduplicateProjects(projects.data ?? [], projectId).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  })) : [];
  const placeholder = projects.directoryReady ? copy("Proje seçin", "Choose a project")
    : linkDown ? copy("Bağlantı bekleniyor", "Waiting for a connection")
    : projects.error ? copy("Kullanılamıyor", "Unavailable")
    : projects.readiness === "loading" ? copy("Projeler yükleniyor…", "Loading projects…")
    : copy("Proje doğrulanıyor…", "Verifying project…");
  return (
    <>
      <SelectField
        label={copy("Proje filtresi", "Project filter")}
        compact
        hideLabel
        disabled={!projects.directoryReady}
        value={
          !projects.directoryReady ? undefined
          : projectId && options.some((option) => option.value === projectId)
            ? projectId
            : !projectId && allowAll
              ? ""
              : undefined
        }
        placeholder={placeholder}
        options={
          projects.directoryReady && allowAll
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
