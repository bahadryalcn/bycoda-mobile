import type {
  HostSessionSummary,
  MachineChanges,
} from "../../../../src/features/connections/model/protocol";

export type ProjectSummaries = {
  instanceId?: string;
  limited?: boolean;
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
  const entries: Array<readonly [string, ProjectSummaries["projects"][string]]> = [];
  for (let offset = 0; offset < ids.length; offset += 6)
    entries.push(
      ...(await Promise.all(
        ids.slice(offset, offset + 6).map(
          async (projectId) =>
            [
              projectId,
              {
                etag: "",
                sessions: await client.request<HostSessionSummary[]>(
                  "sessions.list",
                  { projectId },
                  options,
                ),
              },
            ] as const,
        ),
      )),
    );
  return { limited: projectIds.length > ids.length, projects: Object.fromEntries(entries) };
}
