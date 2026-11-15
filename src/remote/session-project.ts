/** A session's project changed; this is not a paired-computer identity failure. */
export class SessionProjectMismatch extends Error {
  constructor(
    readonly sessionId: string,
    readonly expectedProjectId: string,
    readonly actualProjectId: string,
  ) {
    super("Transcript project identity changed.");
    this.name = "SessionProjectMismatch";
  }
}

type ProjectReader = {
  assertCurrentAccess(): void;
  request<T>(
    method: string,
    params: Record<string, unknown>,
    options: { retry: false; signal?: AbortSignal },
  ): Promise<T>;
};

/** Prove aliases through read-only responses from the original Host, never the session cwd or client path folding. */
export async function sameSessionProjectFolder(
  client: ProjectReader,
  mismatch: SessionProjectMismatch,
  visible: (id: string) => boolean,
  signal?: AbortSignal,
): Promise<boolean> {
  const current = () => {
    signal?.throwIfAborted();
    client.assertCurrentAccess();
    return visible(mismatch.expectedProjectId) && visible(mismatch.actualProjectId);
  };
  if (!current()) return false;
  const projects = await client.request<{ id: string; cwd: string }[]>(
    "projects.list",
    {},
    { retry: false, signal },
  );
  if (!current() || !Array.isArray(projects)) return false;
  const expected = projects.find((row) => row.id === mismatch.expectedProjectId);
  const actual = projects.find((row) => row.id === mismatch.actualProjectId);
  if (!expected?.cwd || !actual?.cwd) return false;
  if (expected.cwd === actual.cwd) return true;
  // The Host resolves separators and relative segments using its own filesystem semantics.
  // Different paths (including unproven case/symlink aliases) require an explicit owner choice.
  const paths = await Promise.all(
    [expected, actual].map((row) =>
      client.request<{ path: string }>(
        "projects.browse",
        { path: row.cwd },
        { retry: false, signal },
      ),
    ),
  );
  return (
    current() &&
    typeof paths[0]?.path === "string" &&
    !!paths[0].path &&
    paths[0].path === paths[1]?.path
  );
}
