/** Where a push lands: the tracked branch, or the branch it will publish on the remote. */
export function gitPushTarget(upstream?: string | null, remote?: string | null, branch?: string | null) {
  if (upstream) return upstream;
  if (!remote) return null;
  return branch ? `${remote}/${branch}` : remote;
}

type GitCountCopy = (tr: string, en: string, values?: Record<string, string | number>) => string;
type GitCountFormat = (count: number) => string | number;

/** Singular and plural differ outside Turkish, so a single commit never reads "1 commits". */
export function gitAheadCount(count: number, copy: GitCountCopy, format: GitCountFormat = String) {
  return count === 1
    ? copy("1 commit gönderilecek", "1 commit to push")
    : copy("{p0} commit gönderilecek", "{p0} commits to push", { p0: format(count) });
}

export function gitBehindCount(count: number, copy: GitCountCopy, format: GitCountFormat = String) {
  return count === 1
    ? copy("1 yeni commit al", "Get 1 new commit")
    : copy("{p0} yeni commit al", "Get {p0} new commits", { p0: format(count) });
}

export function gitChangedCount(files: number, staged: number, copy: GitCountCopy) {
  return files === 1
    ? copy("1 dosya değişti, {p0} stage’de", "1 file changed, {p0} staged", { p0: staged })
    : copy("{p0} dosya değişti, {p1} stage’de", "{p0} files changed, {p1} staged", { p0: files, p1: staged });
}

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

/** Applying a suggestion never discards what the user already typed: it is added below the draft. */
export function gitMergeSuggestion(draft: string, suggestion: string) {
  return draft.trim() ? `${draft.trimEnd()}\n\n${suggestion}` : suggestion;
}

/** What the single primary button in the Changes tab does now, like VS Code's smart commit. */
export type GitPrimaryAction =
  | { kind: "commit"; stageAll: boolean; disabled: boolean; block?: GitCommitBlock | "clean" }
  | { kind: "push"; ahead: number; disabled: false };

type GitCommitFiles = readonly { staged: boolean; unstaged: boolean }[];

/**
 * The one commit rule for every commit button: with nothing staged, unstaged changes are
 * staged as part of the commit (smart commit); otherwise only the staged files are committed.
 */
export function gitCommitAction(input: {
  message: string;
  files: GitCommitFiles;
  hasConflicts: boolean;
  hasOperation: boolean;
}): Extract<GitPrimaryAction, { kind: "commit" }> {
  const stagedCount = input.files.filter((file) => file.staged).length;
  const unstagedCount = input.files.filter((file) => file.unstaged).length;
  const blocked = input.hasConflicts || input.hasOperation;
  if (!blocked && !stagedCount && !unstagedCount)
    return { kind: "commit", stageAll: false, disabled: true, block: "clean" };
  const block = gitCommitBlock({
    message: input.message,
    stagedCount: stagedCount || unstagedCount,
    hasConflicts: input.hasConflicts,
    hasOperation: input.hasOperation,
  });
  return { kind: "commit", stageAll: !stagedCount && unstagedCount > 0, disabled: !!block, block };
}

export function gitPrimaryAction(input: {
  message: string;
  files: GitCommitFiles;
  ahead: number;
  hasRemote: boolean;
  hasConflicts: boolean;
  hasOperation: boolean;
}): GitPrimaryAction {
  const commit = gitCommitAction(input);
  // Nothing left to record: offer to send the local commits instead.
  if (commit.block === "clean" && input.hasRemote && input.ahead > 0)
    return { kind: "push", ahead: input.ahead, disabled: false };
  return commit;
}
