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
  let truncated = text.length > bounded.length || start > 0 || allLines.length > MAX_SOURCE_LINES;
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
    columns: Math.max(
      1,
      ...lines.map((line) =>
        Array.from(line.text).reduce(
          (count, character) =>
            count + (character === "\t" ? 8 : character.codePointAt(0)! > 0xff ? 2 : 1),
          0,
        ),
      ),
    ),
  };
}
