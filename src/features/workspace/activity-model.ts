import type { HostProject, HostSessionSummary } from "./wire";
import type { ProjectSummaries } from "./project-summaries";

export function deduplicateProjects(
  projects: readonly HostProject[],
  preferredId?: string | null,
): HostProject[] {
  const identities = new Map<string, HostProject>();
  for (const project of projects) {
    // Host IDs can own different sessions even when their folder spelling matches.
    if (!identities.has(project.id) || project.id === preferredId)
      identities.set(project.id, project);
  }
  return [...identities.values()];
}

export type ActiveSession = { project: HostProject; session: HostSessionSummary };
/** Keep the host's project identity when joining the batched session directory. */
export function projectSessionDirectory(
  projects: readonly HostProject[],
  summaries: readonly (ProjectSummaries | undefined)[],
): ActiveSession[] {
  const all = Object.assign(
    {},
    ...summaries.map((summary) => summary?.projects ?? {}),
  ) as ProjectSummaries["projects"];
  const sessions = new Map<string, ActiveSession>();
  for (const project of projects)
    for (const session of all[project.id]?.sessions ?? []) {
      const previous = sessions.get(session.id);
      if (!previous || session.updatedAt > previous.session.updatedAt)
        sessions.set(session.id, { project, session });
    }
  return [...sessions.values()].sort(
    (a, b) =>
      Number(!!b.session.needsInput) - Number(!!a.session.needsInput) ||
      Number(b.session.status === "running") - Number(a.session.status === "running") ||
      Number(!!b.session.pinned) - Number(!!a.session.pinned) ||
      b.session.updatedAt - a.session.updatedAt,
  );
}

export function activeProjectSessions(
  projects: readonly HostProject[],
  summaries: readonly (ProjectSummaries | undefined)[],
): ActiveSession[] {
  return projectSessionDirectory(projects, summaries).filter(
    ({ session }) => !session.archived && (session.status === "running" || session.needsInput),
  );
}
