import type { GitChangedFile } from "./wire";

export type GitListFilter = "all" | "unstaged" | "staged";
export type GitListRow =
  | { kind: "group"; key: string; staged: boolean; count: number }
  | { kind: "file"; key: string; staged: boolean; file: GitChangedFile };

/** A file with staged and unstaged hunks belongs to both independently actionable groups. */
export function gitListRows(
  files: readonly GitChangedFile[],
  query: string,
  filter: GitListFilter,
): GitListRow[] {
  const search = query.trim().replaceAll("\\", "/").toLocaleLowerCase();
  return (["unstaged", "staged"] as const).flatMap((group): GitListRow[] => {
    if (filter !== "all" && filter !== group) return [];
    const matches = files.filter(
      (file) =>
        file[group] && file.relative.replaceAll("\\", "/").toLocaleLowerCase().includes(search),
    );
    if (!matches.length) return [];
    const staged = group === "staged";
    return [
      { kind: "group", key: group, staged, count: matches.length },
      ...matches.map((file) => ({
        kind: "file" as const,
        key: group + ":" + file.relative,
        staged,
        file,
      })),
    ];
  });
}
