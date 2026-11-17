export type BranchNameProblem = "empty" | "invalid" | "managed";

/** Branches under these prefixes belong to managed workspaces (sessions and tasks). */
export const isManagedBranch = (branch: string | null | undefined): boolean =>
  !!branch && /^(?:refs\/heads\/)?bycoda\/[st]\//.test(branch);

/** `git check-ref-format --branch` basics, plus the reserved managed prefixes. */
export function branchNameProblem(raw: string): BranchNameProblem | null {
  const name = raw.trim();
  if (!name) return "empty";
  if (
    name === "@" ||
    name.length > 250 ||
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.endsWith(".lock") ||
    name.includes("//") ||
    name.includes("..") ||
    name.includes("@{") ||
    /[\s~^:?*[\\\u0000-\u001f\u007f]/.test(name) ||
    name.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"))
  )
    return "invalid";
  return isManagedBranch(name) ? "managed" : null;
}
