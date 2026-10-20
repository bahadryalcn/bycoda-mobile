import type { HostProjectDirectory, HostProjectGroup } from "@/domain/types";
import type { ProjectDirectoryPreferences } from "@/state/project-directory-preferences";

export type DirectoryProject = HostProjectDirectory["projects"][number];
export type DirectorySection = {
  key: string;
  group?: HostProjectGroup;
  count: number;
  total: number;
  expanded: boolean;
  data: DirectoryProject[];
};

export function projectPathLabel(path: string, full = false) {
  if (full) return path;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

export function sortDirectoryProjects<T extends { id: string; name: string }>(
  projects: readonly T[], preferences: Pick<ProjectDirectoryPreferences, "sort" | "recent">,
): T[] {
  if (preferences.sort === "desktop") return [...projects];
  return [...projects].sort((a, b) =>
    (preferences.sort === "recent" ? (preferences.recent[b.id] ?? 0) - (preferences.recent[a.id] ?? 0) : 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export type DirectoryRow =
  | { kind: "group"; key: string; section: DirectorySection }
  | { kind: "project"; key: string; project: DirectoryProject; group?: HostProjectGroup; first: boolean; last: boolean };

/** Individual projects, not whole groups, are virtualization units. */
export function directoryRows(sections: readonly DirectorySection[], grouped: boolean): DirectoryRow[] {
  return sections.flatMap((section): DirectoryRow[] => [
    ...(grouped ? [{ kind: "group" as const, key: `group:${section.key}`, section }] : []),
    ...section.data.map((project, index) => ({
      kind: "project" as const, key: `project:${project.id}`, project, group: section.group,
      first: index === 0, last: index === section.data.length - 1,
    })),
  ]);
}

/** Folder aliases remain distinct: navigation and sessions belong to the host ID. */
export function distinctDirectoryProjects(
  projects: readonly DirectoryProject[],
): DirectoryProject[] {
  return [...new Map(projects.map((project) => [project.id, project])).values()];
}

export function directorySections(
  projects: readonly DirectoryProject[],
  groups: readonly HostProjectGroup[],
  search: string,
  collapsed: Readonly<Record<string, boolean>>,
): DirectorySection[] {
  const query = search.trim().toLocaleLowerCase();
  const groupIds = new Set(groups.map((group) => group.id));
  const members = new Map<string, DirectoryProject[]>();
  for (const project of distinctDirectoryProjects(projects)) {
    const key = project.groupId && groupIds.has(project.groupId) ? project.groupId : "";
    const rows = members.get(key) ?? [];
    rows.push(project);
    members.set(key, rows);
  }
  const sections: DirectorySection[] = [];
  for (const group of [...groups, undefined]) {
    const key = group?.id ?? "";
    const all = members.get(key) ?? [];
    const groupMatches = !!query && !!group?.name.toLocaleLowerCase().includes(query);
    const matching = all.filter(
      (project) =>
        !query ||
        groupMatches ||
        `${project.name} ${project.cwd}`.toLocaleLowerCase().includes(query),
    );
    if (query && !matching.length && !groupMatches) continue;
    if (!group && !all.length) continue;
    const expanded = !!query || !(collapsed[key] ?? group?.collapsed ?? false);
    sections.push({
      key,
      group,
      total: all.length,
      count: matching.length,
      expanded,
      data: expanded ? matching : [],
    });
  }
  return sections;
}
