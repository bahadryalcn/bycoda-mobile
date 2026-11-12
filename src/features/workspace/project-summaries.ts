import type {
  HostSessionSummary,
  MachineChanges,
} from "../../../../src/features/connections/model/protocol";

export type ProjectSummaries = {
  instanceId?: string;
  limited?: boolean;
  /** Projects whose read failed this time; their last known rows are kept. */
  failed?: string[];
  projects: Record<string, { etag: string; sessions: HostSessionSummary[] }>;
};
type SummaryClient = {
  request<T>(
    method: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
};

/** Deltas require the exact project baseline; a restarted host resets all cursors. */
export function applyProjectChanges(
  known: ProjectSummaries | undefined,
  changes: MachineChanges,
): ProjectSummaries {
  const projects: ProjectSummaries["projects"] =
    changes.reset || known?.instanceId !== changes.instanceId ? {} : { ...known.projects };
  for (const change of changes.projects) {
    if (change.sessions) {
      projects[change.projectId] = { etag: change.etag, sessions: change.sessions };
      continue;
    }
    const previous = projects[change.projectId];
    if (!previous || previous.etag !== change.base)
      throw new Error("Project summary baseline changed.");
    const sessions = new Map(previous.sessions.map((session) => [session.id, session]));
    for (const id of change.removed ?? []) sessions.delete(id);
    for (const session of change.upserts ?? []) sessions.set(session.id, session);
    projects[change.projectId] = { etag: change.etag, sessions: [...sessions.values()] };
  }
  return { instanceId: changes.instanceId, projects };
}

export async function readProjectSummaries(
  client: SummaryClient,
  projectIds: string[],
  known: ProjectSummaries | undefined,
  batched = true,
  options: { signal?: AbortSignal } = {},
): Promise<ProjectSummaries> {
  const ids = projectIds.slice(0, 32);
  if (batched) {
    try {
      const changes = await client.request<MachineChanges>(
        "machine.changes",
        {
          instanceId: known?.instanceId,
          sessions: [],
          projects: ids.map((projectId) => ({
            projectId,
            known: known?.projects[projectId]?.etag,
          })),
          waitMs: 0,
        },
        options,
      );
      try {
        return { ...applyProjectChanges(known, changes), limited: projectIds.length > ids.length };
      } catch {
        const fresh = await client.request<MachineChanges>(
          "machine.changes",
          { sessions: [], projects: ids.map((projectId) => ({ projectId })), waitMs: 0 },
          options,
        );
        return {
          ...applyProjectChanges(undefined, fresh),
          limited: projectIds.length > ids.length,
        };
      }
    } catch (error) {
      if (
        (error as { kind?: string })?.kind !== "unsupported" &&
        !(error instanceof Error && /Unsupported host method/.test(error.message))
      )
        throw error;
    }
  }
  // One project the Host cannot read must not hide the other projects' sessions.
  const projects: ProjectSummaries["projects"] = {};
  const failed: string[] = [];
  let firstError: unknown;
  for (let offset = 0; offset < ids.length; offset += 6) {
    const batch = ids.slice(offset, offset + 6);
    const results = await Promise.allSettled(
      batch.map((projectId) =>
        client.request<HostSessionSummary[]>("sessions.list", { projectId }, options),
      ),
    );
    results.forEach((result, index) => {
      const projectId = batch[index]!;
      if (result.status === "fulfilled") {
        projects[projectId] = { etag: "", sessions: result.value };
        return;
      }
      firstError ??= result.reason;
      failed.push(projectId);
      const previous = known?.projects[projectId];
      if (previous) projects[projectId] = previous;
    });
  }
  if (failed.length === ids.length && ids.length) throw firstError;
  return {
    limited: projectIds.length > ids.length,
    projects,
    ...(failed.length ? { failed } : {}),
  };
}

/** Newest non-archived session update per project, for the quiet "last active" meta. */
export function latestProjectActivity(
  rows: readonly { project: { id: string }; session: { updatedAt: number; archived?: boolean } }[],
): Record<string, number> {
  const latest: Record<string, number> = {};
  for (const { project, session } of rows)
    if (!session.archived && session.updatedAt > (latest[project.id] ?? 0))
      latest[project.id] = session.updatedAt;
  return latest;
}
