import { parsePatch } from "diff";
import type { RemoteInboxReview, RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
export type PrReviewContext = { commitId: string; headOid: string; additions: number; deletions: number; files: { path: string; additions: number; deletions: number }[]; patch: string; truncated: boolean };
export type PrReviewLine = { id: string; path: string; text: string; kind: "context" | "add" | "remove"; side: "LEFT" | "RIGHT"; line: number };
const path = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 1000 && !/[\0\r\n\\:]/.test(value) && !value.startsWith("/") && !value.split("/").some((part) => !part || part === "." || part === "..");
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function readPrReviewContext(value: unknown): PrReviewContext {
  const row = value as PrReviewContext | null;
  if (!row || !/^[a-f0-9]{40}$/.test(row.commitId) || row.headOid !== row.commitId || !count(row.additions) || !count(row.deletions) ||
    !Array.isArray(row.files) || row.files.length > 1000 || row.files.some((file) => !file || !path(file.path) || !count(file.additions) || !count(file.deletions)) || new Set(row.files.map((file) => file.path)).size !== row.files.length ||
    typeof row.patch !== "string" || row.patch.length > 2 * 1024 * 1024 || new TextEncoder().encode(row.patch).length > 2 * 1024 * 1024 || row.patch.includes("\0") || typeof row.truncated !== "boolean")
    throw new Error("Invalid reviewed pull request diff");
  return { commitId: row.commitId, headOid: row.headOid, additions: row.additions, deletions: row.deletions, files: row.files.map(({ path, additions, deletions }) => ({ path, additions, deletions })), patch: row.patch, truncated: row.truncated };
}
/** Only actual, complete unified-diff lines can become inline comment anchors. */
export function prReviewLines(context: PrReviewContext): PrReviewLine[] {
  if (context.truncated || !context.patch.trim()) return [];
  const result: PrReviewLine[] = [];
  for (const file of parsePatch(context.patch)) {
    const filename = (file.newFileName === "/dev/null" ? file.oldFileName : file.newFileName)?.replace(/^[ab]\//, "");
    if (!path(filename) || !context.files.some((entry) => entry.path === filename)) throw new Error("The diff file identity does not match its review context");
    for (const hunk of file.hunks) {
      let before = hunk.oldStart; let after = hunk.newStart;
      for (const raw of hunk.lines) {
        if (raw.startsWith("\\")) continue;
        const marker = raw[0]; if (![" ", "+", "-"].includes(marker ?? "")) throw new Error("Invalid diff line");
        const side = marker === "-" ? "LEFT" : "RIGHT"; const line = side === "LEFT" ? before : after;
        if (!Number.isSafeInteger(line) || line < 1 || line > 2147483647 || result.length >= 50_000) throw new Error("The diff exceeds the inline review limit");
        result.push({ id: `${filename}:${side}:${line}`, path: filename, text: raw.slice(1), kind: marker === "+" ? "add" : marker === "-" ? "remove" : "context", side, line });
        if (marker !== "+") before++; if (marker !== "-") after++;
      }
    }
  }
  if (new Set(result.map((line) => line.id)).size !== result.length) throw new Error("Ambiguous inline diff locations");
  return result;
}
export function reviewedPrSubmission(context: PrReviewContext, event: RemoteInboxReview["event"], body: string, comments: RemoteInboxReviewComment[]): RemoteInboxReview {
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event) || typeof body !== "string" || body.length > 30_000 || body.includes("\0") || event !== "APPROVE" && !body.trim() || comments.length > 50)
    throw new Error("Write a bounded review summary and choose a review action");
  if (context.truncated && comments.length) throw new Error("Inline comments require a complete diff");
  const lines = prReviewLines(context);
  const checked = comments.map((comment) => {
    if (!lines.some((line) => line.path === comment.path && line.line === comment.line && line.side === comment.side) || comment.startLine !== undefined || typeof comment.body !== "string" || !comment.body.trim() || comment.body.length > 30_000 || comment.body.includes("\0"))
      throw new Error("Review comments must target a displayed diff line");
    return { path: comment.path, side: comment.side, line: comment.line, body: comment.body };
  });
  if (body.length + checked.reduce((sum, comment) => sum + comment.body.length, 0) > 60_000) throw new Error("Review content is too large");
  return { commitId: context.commitId, event, body, comments: checked };
}
