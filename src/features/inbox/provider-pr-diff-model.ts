import { parsePatch } from "diff";
import type { RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
import type { PrReviewContext } from "./provider-review-model";

export type PrDiffFileStatus = "added" | "modified" | "deleted" | "renamed";
/** The GitHub review anchor of one diff line: the side it belongs to and its line there. */
export type PrDiffAnchor = { side: "LEFT" | "RIGHT"; line: number };
export type PrDiffRow =
  | { type: "hunk"; id: string; header: string }
  | {
      type: "line";
      id: string;
      kind: "add" | "remove" | "context";
      text: string;
      oldLine?: number;
      newLine?: number;
      /** Present only for complete diffs, where the line can carry an inline comment. */
      anchor?: PrDiffAnchor;
    };
export type PrDiffFile = {
  path: string;
  previousPath?: string;
  status: PrDiffFileStatus;
  additions: number;
  deletions: number;
  rows: PrDiffRow[];
};

const strip = (name: string | undefined) => name?.replace(/^[ab]\//, "");

/**
 * One entry per changed file, in the provider's order, each with its own hunks and line numbers.
 * Anchors use the same rule as `prReviewLines` (removed lines on LEFT at their old number, added
 * and context lines on RIGHT at their new number), so a tapped line is always a valid review target.
 * A partial patch still shows what parsed, without anchors; an unparsable tail shows no rows.
 */
export function prDiffFiles(context: PrReviewContext): PrDiffFile[] {
  const parsed = new Map<string, { previousPath?: string; status: PrDiffFileStatus; rows: PrDiffRow[] }>();
  // Each file parses on its own, so a cut-off last file (partial diff) leaves the others readable.
  const patches = context.patch.split(/^(?=diff --git )/m).flatMap((chunk) => {
    if (!chunk.trim()) return [];
    try {
      return parsePatch(chunk);
    } catch {
      return [];
    }
  });
  const commentable = !context.truncated;
  for (const patch of patches) {
    const oldName = strip(patch.oldFileName);
    const newName = strip(patch.newFileName);
    const deleted = patch.newFileName === "/dev/null";
    const added = patch.oldFileName === "/dev/null";
    const path = deleted ? oldName : newName;
    if (!path || parsed.has(path)) continue;
    const status: PrDiffFileStatus = added ? "added" : deleted ? "deleted" : oldName && oldName !== newName ? "renamed" : "modified";
    const rows: PrDiffRow[] = [];
    for (const [hunkIndex, hunk] of patch.hunks.entries()) {
      rows.push({
        type: "hunk",
        id: `${path}#${hunkIndex}`,
        header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      });
      let before = hunk.oldStart;
      let after = hunk.newStart;
      for (const raw of hunk.lines) {
        const marker = raw[0];
        if (marker !== " " && marker !== "+" && marker !== "-") continue;
        const kind = marker === "+" ? "add" : marker === "-" ? "remove" : "context";
        const oldLine = kind === "add" ? undefined : before;
        const newLine = kind === "remove" ? undefined : after;
        const anchor: PrDiffAnchor | undefined = !commentable ? undefined
          : kind === "remove" ? { side: "LEFT", line: before } : { side: "RIGHT", line: after };
        rows.push({
          type: "line",
          id: `${path}:${kind}:${oldLine ?? ""}:${newLine ?? ""}`,
          kind,
          text: raw.slice(1),
          oldLine,
          newLine,
          ...(anchor && anchor.line >= 1 ? { anchor } : {}),
        });
        if (kind !== "add") before++;
        if (kind !== "remove") after++;
      }
    }
    parsed.set(path, { status, rows, ...(status === "renamed" && oldName ? { previousPath: oldName } : {}) });
  }
  return context.files.map((file) => {
    const entry = parsed.get(file.path);
    return {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      status: entry?.status ?? "modified",
      rows: entry?.rows ?? [],
      ...(entry?.previousPath ? { previousPath: entry.previousPath } : {}),
    };
  });
}

/** Search by path (case-insensitive, any part) and optionally leave test files out. */
export function filterPrDiffFiles<T extends { path: string }>(
  files: readonly T[],
  { query, hideTests, isTest }: { query: string; hideTests: boolean; isTest: (path: string) => boolean },
): T[] {
  const needle = query.trim().toLowerCase();
  return files.filter((file) => (!hideTests || !isTest(file.path)) && (!needle || file.path.toLowerCase().includes(needle)));
}

export const prAnchorKey = (path: string, anchor: PrDiffAnchor) => `${path}\u0000${anchor.side}\u0000${anchor.line}`;

/** Pending comments of one file, keyed by anchor, with their position in the draft. */
export function pendingByAnchor(comments: readonly RemoteInboxReviewComment[], path: string) {
  const result = new Map<string, { index: number; comment: RemoteInboxReviewComment }>();
  comments.forEach((comment, index) => {
    if (comment.path === path) result.set(prAnchorKey(path, comment), { index, comment });
  });
  return result;
}

export function splitPath(path: string) {
  const slash = path.lastIndexOf("/");
  return { name: slash >= 0 ? path.slice(slash + 1) : path, directory: slash >= 0 ? path.slice(0, slash) : "" };
}
