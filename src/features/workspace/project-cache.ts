const WORKSPACE_QUERIES = new Set([
  "git",
  "diff",
  "branches",
  "worktrees",
  "files",
  "file",
  "file-content",
]);

/** A branch or working-tree mutation also makes file and search views stale. */
export function isProjectWorkspaceQuery(
  key: readonly unknown[],
  machineId: string | null,
  projectId: string,
) {
  return (
    machineId !== null &&
    key[0] === "machine" &&
    key[1] === machineId &&
    key[3] === projectId &&
    typeof key[2] === "string" &&
    WORKSPACE_QUERIES.has(key[2])
  );
}
