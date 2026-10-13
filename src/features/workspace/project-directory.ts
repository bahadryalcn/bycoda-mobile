import type { HostProjectDirectory, HostProjectGroup } from "@/domain/types";

export type DirectoryProject = HostProjectDirectory["projects"][number];
export type DirectorySection = {
  key: string;
  group?: HostProjectGroup;
  count: number;
  total: number;
  expanded: boolean;
  data: DirectoryProject[];
};

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
