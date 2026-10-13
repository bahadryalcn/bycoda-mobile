import { useMemo } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import type { HostProject, HostProjectDirectory } from "@/domain/types";
import { deduplicateProjects } from "./activity-model";
import { distinctDirectoryProjects } from "./project-directory";
const DIRECTORY_QUERY_KEY = "directory";

export function useProjectDirectory() {
  const machine = useActiveMachine();
  const grouped = !!machine?.capabilities?.includes("projects.directory.v1");
  const legacy = useHostQuery<HostProject[]>(
    ["projects"],
    "projects.list",
    {},
    { interval: 15_000, enabled: !grouped },
  );
  const directory = useHostQuery<HostProjectDirectory>(
    ["projects", DIRECTORY_QUERY_KEY],
    "projects.directory",
    {},
    { interval: 15_000, enabled: grouped },
  );
  const query = grouped ? directory : legacy;
  const projects = useMemo(
    () =>
      grouped
        ? distinctDirectoryProjects(directory.data?.privacyReady ? directory.data.projects : [])
        : deduplicateProjects(legacy.data ?? []).map((project) => ({
            ...project,
            registered: true,
          })),
    [grouped, directory.data, legacy.data],
  );
  const registered = useMemo(() => projects.filter((project) => project.registered), [projects]);
  const groups = useMemo(
    () => (grouped && directory.data?.privacyReady ? directory.data.groups : []),
    [grouped, directory.data],
  );
  const privacyPending = grouped && !!directory.data && !directory.data.privacyReady;
  return { query, projects, registered, groups, grouped, privacyPending };
}

/** Session/action lookups use host IDs; desktop-only folders require an explicit open first. */
export function useProjectList() {
  const directory = useProjectDirectory();
  return {
    ...directory.query,
    data: directory.query.data === undefined ? undefined : directory.registered,
    isSuccess: directory.query.isSuccess && !directory.privacyPending,
    privacyPending: directory.privacyPending,
  };
}
