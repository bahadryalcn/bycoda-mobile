import type { HostProjectGroup } from "@/domain/types";

type GroupableProject = { id: string; cwd: string; name: string; groupId?: string; pinned?: boolean };

const REPOSITORY_GROUP_PREFIX = "repo:";
export const isRepositoryGroupId = (id: string) => id.startsWith(REPOSITORY_GROUP_PREFIX);

const normalize = (path: string) => {
  const value = path.replace(/\\/g, "/").replace(/\/+$/, "");
  // Only Windows drive and UNC paths fold case; Host paths elsewhere may be case-sensitive.
  return /^[a-z]:\//i.test(value) || value.startsWith("//") ? value.toLowerCase() : value;
};

/** Folders that hold linked worktrees inside a repository: `<repo>/.worktrees/<branch>` and similar. */
const insideRepository = /^(.+?)\/(?:\.worktrees|\.claude\/worktrees|\.git\/worktrees)\/[^/]+(?:\/.*)?$/;
/** Sibling folders named after a repository: `<parent>/<repo>.worktrees/<branch>`, `<repo>-worktrees/<branch>`. */
const siblingOfRepository = /^(.+)\/([^/]+?)(?:\.worktrees|-worktrees)\/[^/]+(?:\/.*)?$/;

/**
 * The Host exports no repository identity, so the root is inferred from the folder layout:
 * a linked-worktree location maps to its repository folder, and a project nested in another
 * listed project's folder joins that project. A project that matches nothing is its own root.
 */
export function repositoryRoots(projects: readonly { id: string; cwd: string }[]): Map<string, string> {
  const paths = projects.map((project) => ({ id: project.id, key: normalize(project.cwd) }));
  const known = new Set(paths.map((item) => item.key));
  const roots = new Map<string, string>();
  for (const { id, key } of paths) {
    const inside = insideRepository.exec(key);
    if (inside) { roots.set(id, inside[1]!); continue; }
    const sibling = siblingOfRepository.exec(key);
    if (sibling) { roots.set(id, `${sibling[1]}/${sibling[2]}`); continue; }
    let parent: string | undefined;
    for (const other of known)
      if (key.startsWith(`${other}/`) && (!parent || other.length > parent.length)) parent = other;
    roots.set(id, parent ?? key);
  }
  // A nested project may itself sit under a worktree-derived root; resolve one more hop.
  for (const [id, root] of roots) {
    const outer = [...roots.values()].filter((other) => other !== root && root.startsWith(`${other}/`));
    if (outer.length) roots.set(id, outer.sort((a, b) => b.length - a.length)[0]!);
  }
  return roots;
}

const lastSegment = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/**
 * Re-groups a project list by repository. Repositories with at least two projects become groups
 * (named after the project at the root, else the root folder); single projects stay ungrouped.
 * Desktop groups are replaced while this view is on; pinned state is kept.
 */
export function groupProjectsByRepository<T extends GroupableProject>(
  projects: readonly T[],
): { projects: T[]; groups: HostProjectGroup[] } {
  const roots = repositoryRoots(projects);
  const members = new Map<string, T[]>();
  for (const project of projects) {
    const root = roots.get(project.id)!;
    members.set(root, [...(members.get(root) ?? []), project]);
  }
  const groups: HostProjectGroup[] = [];
  const grouped = new Map<string, string>();
  for (const [root, list] of members) {
    if (list.length < 2) continue;
    const id = `${REPOSITORY_GROUP_PREFIX}${root}`;
    const rootProject = list.find((project) => normalize(project.cwd) === root);
    groups.push({ id, name: rootProject?.name ?? lastSegment(root) });
    for (const project of list) grouped.set(project.id, id);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return {
    groups,
    projects: projects.map((project) => {
      const { groupId: _desktopGroup, ...rest } = project;
      const groupId = grouped.get(project.id);
      return (groupId ? { ...rest, groupId } : rest) as T;
    }),
  };
}
