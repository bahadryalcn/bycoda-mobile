import type { HostProjectDirectory, HostProjectGroup } from "@/domain/types";
import type { ProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import {
  duplicateProjectNames,
  isDuplicateProjectName,
  parentFolderLabel,
} from "../../../../src/features/projects/ui/projectIdentity";

export type DirectoryProject = HostProjectDirectory["projects"][number];
export type DirectorySection = {
  key: string;
  group?: HostProjectGroup;
  /** The desktop rail's Pinned section: ungrouped projects pinned on the computer. */
  pinned?: true;
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

/** Section key of the pinned projects; group ids never start with a colon. */
export const PINNED_SECTION_KEY = ":pinned";

/** Desktop rail parity: pinned projects stay on top; running sessions never reorder projects. */
export function sortDirectoryProjects<T extends { id: string; name: string; pinned?: boolean }>(
  projects: readonly T[], preferences: Pick<ProjectDirectoryPreferences, "sort" | "recent">,
): T[] {
  // Custom order is applied by the caller (applyCustomOrder); keep the computer order here.
  if (preferences.sort === "custom") return [...projects];
  return [...projects].sort((a, b) =>
    Number(!!b.pinned) - Number(!!a.pinned) ||
    (preferences.sort === "desktop" ? 0 :
    (preferences.sort === "recent" ? (preferences.recent[b.id] ?? 0) - (preferences.recent[a.id] ?? 0) : 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })));
}

export type DirectoryRow =
  | { kind: "group"; key: string; section: DirectorySection }
  | { kind: "project"; key: string; project: DirectoryProject; group?: HostProjectGroup; first: boolean; last: boolean; depth: number };

const folderKey = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  // Host paths may be case-sensitive; only Windows drive/UNC paths inherit case folding.
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized;
};

/**
 * Desktop rail parity: display names are not unique, so a project whose name another project shares
 * gets its parent folder as a short hint. Spellings of one folder count once.
 */
export function projectNameContexts(projects: readonly { id: string; name: string; cwd: string }[]): Record<string, string> {
  const duplicates = duplicateProjectNames(
    projects.map((project) => ({ path: project.cwd, name: project.name })),
    (a, b) => folderKey(a) === folderKey(b),
  );
  const contexts: Record<string, string> = {};
  for (const project of projects) {
    if (!isDuplicateProjectName(duplicates, project.name)) continue;
    const parent = parentFolderLabel(project.cwd);
    if (parent) contexts[project.id] = parent;
  }
  return contexts;
}

/** Registered projects retain their identity; only discovered folders inherit path nesting. */
export function nestDirectoryProjects<T extends { cwd: string; registered?: boolean }>(projects: readonly T[]): { project: T; depth: number }[] {
  const keys = projects.map((project) => folderKey(project.cwd));
  const parentOf = projects.map((_, index) => {
    if (projects[index]!.registered) return -1;
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
): DirectorySection[] {
  const query = search.trim().toLocaleLowerCase();
  const groupIds = new Set(groups.map((group) => group.id));
  const members = new Map<string, DirectoryProject[]>();
  for (const project of distinctDirectoryProjects(projects)) {
    const grouped = !!project.groupId && groupIds.has(project.groupId);
    const key = grouped ? project.groupId! : project.pinned ? PINNED_SECTION_KEY : "";
    const rows = members.get(key) ?? [];
    rows.push(project);
    members.set(key, rows);
  }
  const sections: DirectorySection[] = [];
  // Desktop rail order: Pinned, then groups, then the remaining projects.
  const slots: { key: string; group?: HostProjectGroup; pinned?: true }[] = [
    { key: PINNED_SECTION_KEY, pinned: true },
    ...groups.map((group) => ({ key: group.id, group })),
    { key: "" },
  ];
  for (const { key, group, pinned } of slots) {
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
      ...(pinned ? { pinned } : {}),
      total: all.length,
      running: matching.reduce((sum, project) => sum + (running[project.id] ?? 0), 0),
      count: matching.length,
      expanded,
      data: expanded ? matching : [],
    });
  }
  return sections;
}
