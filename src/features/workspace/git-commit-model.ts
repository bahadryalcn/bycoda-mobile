/** Why the Commit action cannot run. Order is the order the user should resolve blockers in. */
export type GitCommitBlock = "operation" | "staged" | "message";

/**
 * Single source for the Commit disabled state and its explanation. The visible hint and the
 * accessible name of the button are both derived from this value, so they cannot disagree.
 */
export function gitCommitBlock(input: {
  message: string;
  stagedCount: number;
  hasConflicts: boolean;
  hasOperation: boolean;
}): GitCommitBlock | undefined {
  if (input.hasConflicts || input.hasOperation) return "operation";
  if (!input.stagedCount) return "staged";
  if (!input.message.trim()) return "message";
  return undefined;
}

/** What the single primary button in the Changes tab does now, like VS Code's smart commit. */
export type GitPrimaryAction =
  | { kind: "commit"; stageAll: boolean; disabled: boolean; block?: GitCommitBlock | "clean" }
  | { kind: "push"; ahead: number; disabled: false };

export function gitPrimaryAction(input: {
  message: string;
  files: readonly { staged: boolean; unstaged: boolean }[];
  ahead: number;
  hasRemote: boolean;
  hasConflicts: boolean;
  hasOperation: boolean;
}): GitPrimaryAction {
  const stagedCount = input.files.filter((file) => file.staged).length;
  const unstagedCount = input.files.filter((file) => file.unstaged).length;
  const blocked = input.hasConflicts || input.hasOperation;
  // Nothing left to record: offer to send the local commits instead.
  if (!blocked && !stagedCount && !unstagedCount && input.hasRemote && input.ahead > 0)
    return { kind: "push", ahead: input.ahead, disabled: false };
  if (!blocked && !stagedCount && !unstagedCount)
    return { kind: "commit", stageAll: false, disabled: true, block: "clean" };
  const stageAll = !stagedCount && unstagedCount > 0;
  const block = gitCommitBlock({
    message: input.message,
    // Smart commit: unstaged changes count as stageable when nothing is staged.
    stagedCount: stagedCount || unstagedCount,
    hasConflicts: input.hasConflicts,
    hasOperation: input.hasOperation,
  });
  return { kind: "commit", stageAll, disabled: !!block, block };
}
