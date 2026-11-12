export const RECENT_PROJECT_LIMIT = 5;

type RecencyInput = {
  /** Newest session update per project (`latestProjectActivity`). */
  activity: Readonly<Record<string, number>>;
  /** When the owner last opened each project (`preferences.recent`). */
  opened: Readonly<Record<string, number>>;
  /** Privacy/visibility gate; hidden projects never appear. */
  isVisible?: (projectId: string) => boolean;
};

const stamp = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** The moment a project was last used: its newest session update or the last time it was opened. */
export function projectRecency(projectId: string, { activity, opened }: Pick<RecencyInput, "activity" | "opened">) {
  return Math.max(stamp(activity[projectId]), stamp(opened[projectId]));
}

/**
 * Visible projects, most recently used first. Projects without any timestamp follow in their
 * given order, so a computer that was never used still offers its projects.
 */
export function orderProjectsByRecency<T extends { id: string }>(projects: readonly T[], input: RecencyInput): T[] {
  return projects
    .filter((project) => input.isVisible?.(project.id) ?? true)
    .map((project, index) => ({ project, index, recency: projectRecency(project.id, input) }))
    .sort((a, b) => b.recency - a.recency || a.index - b.index)
    .map(({ project }) => project);
}

export function recentProjects<T extends { id: string }>(
  projects: readonly T[],
  input: RecencyInput,
  limit = RECENT_PROJECT_LIMIT,
): T[] {
  return orderProjectsByRecency(projects, input).slice(0, Math.max(0, limit));
}
