import { parseFileDraft, type FileDraft } from "./draft-store";

export function fileDraftStorageKey(
  machineId: string | undefined,
  projectId: string,
  cwd: string | undefined,
  path: string,
) {
  return `bycoda.mobile.file-draft.v1:${JSON.stringify([machineId, projectId, cwd, path])}`;
}

/** Recovery is read-only: opening a file never rewrites, migrates or deletes an old draft. */
export async function readPreservedFileDraft(
  storage: { getItem(key: string): Promise<string | null> },
  key: string,
): Promise<FileDraft | null> {
  const raw = await storage.getItem(key);
  return raw === null ? null : parseFileDraft(raw);
}

export const MAX_REVIEW_CHARACTERS = 200_000;
const MAX_SOURCE_LINES = 2_000;
const MAX_LINE_CHARACTERS = 2_000;

/** A bounded source viewport; truncation is explicit and never changes the stored source. */
export function reviewSource(text: string, requestedLine?: number) {
  const bounded = text.slice(0, MAX_REVIEW_CHARACTERS);
  const allLines = bounded.split(/\r\n|\n|\r/);
  const targetAvailable =
    requestedLine !== undefined &&
    Number.isSafeInteger(requestedLine) &&
    requestedLine > 0 &&
    requestedLine <= allLines.length;
  // Stay inside the existing character budget, even for a distant search hit.
  const start = targetAvailable ? Math.max(0, requestedLine - 4) : 0;
  // Earlier context is reachable with Show file beginning; an offset alone is
  // not a safety limit. Report only content omitted by a preview budget.
  let truncated = text.length > bounded.length || allLines.length - start > MAX_SOURCE_LINES;
  const lines = allLines.slice(start, start + MAX_SOURCE_LINES).map((line, index) => {
    if (line.length > MAX_LINE_CHARACTERS) truncated = true;
    return { number: start + index + 1, text: line.slice(0, MAX_LINE_CHARACTERS) };
  });
  return {
    lines,
    truncated,
    characters: text.length,
    targetLine: targetAvailable ? requestedLine : undefined,
    locationUnavailable: requestedLine !== undefined && !targetAvailable,
    columns: Math.max(1, ...lines.map((line) => lineColumns(line.text))),
  };
}

/** Tab = 8, wide code point = 2, other = 1; scans code units so a huge file allocates no per-character arrays. */
function lineColumns(text: string) {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    // A low surrogate completes a code point the preceding high surrogate already counted.
    if (unit >= 0xdc00 && unit <= 0xdfff && index > 0) {
      const previous = text.charCodeAt(index - 1);
      if (previous >= 0xd800 && previous <= 0xdbff) continue;
    }
    count += unit === 9 ? 8 : unit > 0xff ? 2 : 1;
  }
  return count;
}

export const SELECTION_WINDOW_LINES = 200;

/** Select-text view renders one bounded window of the reviewed lines, never the whole preview. */
export function selectionWindow(lines: { number: number; text: string }[], requestedStart: number) {
  const start = Math.min(
    Math.max(0, Number.isSafeInteger(requestedStart) ? requestedStart : 0),
    Math.max(0, lines.length - 1),
  );
  const end = Math.min(lines.length, start + SELECTION_WINDOW_LINES);
  return {
    start,
    end,
    previousStart: start > 0 ? Math.max(0, start - SELECTION_WINDOW_LINES) : undefined,
    nextStart: end < lines.length ? end : undefined,
    firstNumber: lines[start]?.number,
    lastNumber: lines[end - 1]?.number,
    text: lines.slice(start, end).map((line) => line.text).join("\n"),
  };
}
