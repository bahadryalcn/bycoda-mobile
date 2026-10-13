import { diffLines as compareLines } from "diff";
import type { DiffLine, DiffOptions, DiffPreview } from "./wire-types";

/** Bounded preview diff; saved and staged content is never truncated. */
export function diffLines(
  original: string,
  current: string,
  options: DiffOptions = {},
): DiffPreview {
  if (original === current)
    return { lines: [], tooLarge: false, truncated: false, unchanged: true };
  const changes = compareLines(original, current, {
    timeout: options.timeout ?? 120,
    maxEditLength: options.maxEditLength ?? 8_000,
  });
  if (!changes) return { lines: [], tooLarge: true, truncated: false, unchanged: false };
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let truncated = false;
  for (const [index, change] of changes.entries()) {
    const kind = change.added ? "add" : change.removed ? "remove" : "same";
    let textLines = change.value.split(/\r?\n/);
    if (textLines.at(-1) === "") textLines = textLines.slice(0, -1);
    // Context windows use positions: an unchanged source line can itself be "⋯".
    for (const [position, text] of textLines.entries()) {
      const numbered: DiffLine = {
        kind,
        text,
        ...(kind !== "add" ? { oldLine: oldLine++ } : {}),
        ...(kind !== "remove" ? { newLine: newLine++ } : {}),
      };
      if (kind === "same") {
        if (index === 0 && position < textLines.length - 3) continue;
        if (index === changes.length - 1 && position >= 3) continue;
        if (
          index > 0 &&
          index < changes.length - 1 &&
          textLines.length > 6 &&
          position >= 3 &&
          position < textLines.length - 3
        ) {
          if (position === 3) lines.push({ kind: "context", text: "⋯" });
          continue;
        }
      }
      if (lines.length === 4_000) {
        truncated = true;
        break;
      }
      lines.push(numbered);
    }
    if (truncated) break;
  }
  return { lines, tooLarge: false, truncated, unchanged: false };
}
