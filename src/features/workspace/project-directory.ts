import type { HostProjectDirectory, HostProjectGroup } from "@/domain/types";
import type { ProjectDirectoryPreferences } from "@/state/project-directory-preferences";

export type DirectoryProject = HostProjectDirectory["projects"][number];
export type DirectorySection = {
  key: string;
  group?: HostProjectGroup;
  count: number;
  total: number;
  running: number;
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
  running: Readonly<Record<string, number>> = {},
): T[] {
  // Custom order is applied by the caller (applyCustomOrder); keep the computer order here.
  if (preferences.sort === "custom") return [...projects];
  return [...projects].sort((a, b) =>
    Number(!!running[b.id]) - Number(!!running[a.id]) ||
    (preferences.sort === "desktop" ? 0 :
    (preferences.sort === "recent" ? (preferences.recent[b.id] ?? 0) - (preferences.recent[a.id] ?? 0) : 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })));
}

export type DirectoryRow =
  | { kind: "group"; key: string; section: DirectorySection }
  | { kind: "project"; key: string; project: DirectoryProject; group?: HostProjectGroup; first: boolean; last: boolean; depth: number };

const folderKey = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();

/** A project folder inside another project's folder is shown as that project's workspace. */
export function nestDirectoryProjects<T extends { cwd: string }>(projects: readonly T[]): { project: T; depth: number }[] {
  const keys = projects.map((project) => folderKey(project.cwd));
  const parentOf = projects.map((_, index) => {
    let best = -1;
    keys.forEach((key, other) => {
      if (other !== index && keys[index]!.startsWith(`${key}/`) && (best < 0 || key.length > keys[best]!.length)) best = other;
    });
    return best;
  });
  const out: { project: T; depth: number }[] = [];
  const place = (index: number, depth: number) => {
    out.push({ project: projects[index]!, depth });
    parentOf.forEach((parent, child) => { if (parent === index) place(child, depth + 1); });
  };
  parentOf.forEach((parent, index) => { if (parent < 0) place(index, 0); });
  return out;
}

/** Individual projects, not whole groups, are virtualization units. */
export function directoryRows(sections: readonly DirectorySection[], grouped: boolean): DirectoryRow[] {
  return sections.flatMap((section): DirectoryRow[] => [
    ...(grouped ? [{ kind: "group" as const, key: `group:${section.key}`, section }] : []),
    ...nestDirectoryProjects(section.data).map(({ project, depth }, index, all) => ({
      kind: "project" as const, key: `project:${project.id}`, project, group: section.group,
      first: index === 0, last: index === all.length - 1, depth,
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
  running: Readonly<Record<string, number>> = {},
  runningFirst = true,
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
      running: matching.reduce((sum, project) => sum + (running[project.id] ?? 0), 0),
      count: matching.length,
      expanded,
      data: expanded ? matching : [],
    });
  }
  return runningFirst ? sections.sort((a, b) => Number(b.running > 0) - Number(a.running > 0)) : sections;
}
