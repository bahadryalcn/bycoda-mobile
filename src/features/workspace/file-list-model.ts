import type { FileEntry } from "./wire";

export type FileListOptions = {
  showHidden: boolean;
  showIgnored: boolean;
  order: "ascending" | "descending";
};

export const defaultFileListOptions: FileListOptions = {
  showHidden: true,
  showIgnored: true,
  order: "ascending",
};

/** Inspect every segment so search results follow the same rules as folder rows. */
export function isHiddenFilePath(path: string): boolean {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => part.startsWith("."));
}

export function visibleFileEntries(
  entries: readonly FileEntry[],
  options: FileListOptions,
): FileEntry[] {
  const direction = options.order === "ascending" ? 1 : -1;
  return entries
    .filter((entry) => {
      const parts = entry.path.replaceAll("\\", "/").split("/");
      // Git internals are never useful project files, including global search results.
      return (
        !parts.includes(".git") &&
        (options.showHidden || !isHiddenFilePath(entry.path)) &&
        (options.showIgnored || !entry.ignored)
      );
    })
    .sort(
      (left, right) =>
        Number(right.isDir) - Number(left.isDir) ||
        direction *
          left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) ||
        left.path.localeCompare(right.path),
    );
}

export function fileParentPath(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).slice(0, -1).join("/");
}
