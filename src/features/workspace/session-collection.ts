import type { HostProjectDirectory } from "@/domain/types";
import type { ActiveSession } from "./activity-model";
import { isRunningSession } from "./activity-model";
import { filterSessionDirectory, sessionDirectoryRows, type SessionDirectoryRow } from "./session-directory";

type DirectoryProject = HostProjectDirectory["projects"][number];
export type ProjectSessionCollectionRow =
  | { kind: "project"; key: string; project: DirectoryProject; count: number; running: number; expanded: boolean }
  | (SessionDirectoryRow & { project: DirectoryProject });

export const sessionCollectionScope = (machineId: string, projectId: string) => JSON.stringify([machineId, projectId]);

/** Match project/folder names while retaining the activity directory's ordering and host IDs. */
export function filterProjectSessionDirectory(
  projects: readonly DirectoryProject[],
  directory: readonly ActiveSession[],
  search: string,
): { project: DirectoryProject; session: ActiveSession["session"] }[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const members = new Map<string, ActiveSession["session"][]>();
  for (const { project, session } of directory) {
    const sessions = members.get(project.id) ?? [];
    sessions.push(session);
    members.set(project.id, sessions);
  }
  const matches = new Map(projects.map((project) => [project.id, new Set(
    filterSessionDirectory(members.get(project.id) ?? [], project.sessionLayout, search, `${project.name} ${project.cwd}`)
      .map((session) => session.id),
  )]));
  return directory.flatMap(({ project, session }) => {
    const current = byId.get(project.id);
    return current && matches.get(project.id)?.has(session.id) ? [{ project: current, session }] : [];
  });
}

/** Keep each project's tree contiguous; only complete project sections may change order. */
export function projectSessionCollectionRows(
  projects: readonly DirectoryProject[],
  directory: readonly ActiveSession[],
  machineId: string,
  collapsedFolders: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {},
  collapsedProjects: Readonly<Record<string, boolean>> = {},
  searching = false,
): ProjectSessionCollectionRow[] {
  const sessionsByProject = new Map<string, ActiveSession["session"][]>();
  for (const { project, session } of directory) {
    const members = sessionsByProject.get(project.id) ?? [];
    members.push(session);
    sessionsByProject.set(project.id, members);
  }
  const sections = projects.flatMap((project) => {
    const sessions = sessionsByProject.get(project.id);
    if (!sessions?.length) return [];
    return [{ project, sessions, running: sessions.filter(isRunningSession).length }];
  }).sort((a, b) => Number(b.running > 0) - Number(a.running > 0));
  return sections.flatMap(({ project, sessions, running }): ProjectSessionCollectionRow[] => {
    const scope = sessionCollectionScope(machineId, project.id);
    const expanded = searching || !collapsedProjects[scope];
    return [
      { kind: "project", key: `project:${project.id}`, project, count: sessions.length, running, expanded },
      ...(expanded ? sessionDirectoryRows(sessions, project.sessionLayout, collapsedFolders[scope], searching)
        .map((row) => ({ ...row, project, key: `${project.id}:${row.key}` })) : []),
    ];
  });
}
