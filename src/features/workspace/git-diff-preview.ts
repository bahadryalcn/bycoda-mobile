import { diffLines as compareLines, type ChangeObject } from "diff";
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
  return previewChanges(changes);
}

/** One raw comparison can feed both preview and selective staging. */
export function previewChanges(changes: ChangeObject<string>[] | undefined): DiffPreview {
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

/** The callback mode yields between edit-distance steps instead of blocking render. */
export function compareLinesAsync(original: string, current: string, options: DiffOptions = {}, signal?: AbortSignal): Promise<ChangeObject<string>[] | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(new Error("Diff cancelled.")); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    // Keep ordinary small reviews immediate, with only an 8ms synchronous budget.
    // A difficult small input falls through to yielding work instead of losing
    // selective-staging support; large input never enters this fast attempt.
    if (original.length + current.length <= 128 * 1024) {
      const quick = compareLines(original, current, {
        timeout: Math.min(options.timeout ?? 120, 8),
        maxEditLength: options.maxEditLength ?? 8_000,
      });
      if (quick) { cleanup(); resolve(quick); return; }
    }
    // An aborted caller is released immediately. Abandoned library timer work is
    // still bounded by this timeout; its result cannot be applied or retained.
    compareLines(original, current, {
      timeout: options.timeout ?? 120,
      maxEditLength: options.maxEditLength ?? 8_000,
      callback: (changes) => { cleanup(); if (!signal?.aborted) resolve(changes); },
    });
  });
}

export async function diffLinesAsync(original: string, current: string, signal?: AbortSignal): Promise<DiffPreview> {
  if (original === current) return { lines: [], tooLarge: false, truncated: false, unchanged: true };
  return previewChanges(await compareLinesAsync(original, current, {}, signal));
}
