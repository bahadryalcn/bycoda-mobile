import { gitFilePresentation } from "./git-file-presentation";

export type GitFileRowAction = "stage" | "unstage" | "preview" | "open" | "discard";

/** Actions for a changed file; deleted files cannot be opened and staged changes are unstaged before discarding. */
export function gitFileRowActions(file: { status: string }, staged: boolean): GitFileRowAction[] {
  const deleted = gitFilePresentation(file.status).kind === "deleted";
  return [
    staged ? "unstage" : "stage",
    "preview",
    ...(deleted ? [] : (["open"] as const)),
    ...(staged ? [] : (["discard"] as const)),
  ];
}

/** Swipe reveals only the quick, frequent actions. */
export const gitSwipeActions = (actions: readonly GitFileRowAction[]) =>
  actions.filter((action) => action === "stage" || action === "unstage" || action === "discard");
