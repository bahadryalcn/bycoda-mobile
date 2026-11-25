import type { MessageNode } from "./message-model";
import type { SelectableRun } from "../../modules/bycoda-text-selection/src/types";

/** The four in-place selection actions, in menu order (desktop's selection toolbar intent). */
export const SELECTION_ACTION_IDS = ["add", "quote", "translate", "copy"] as const;
export type SelectionActionId = (typeof SELECTION_ACTION_IDS)[number];
export const isSelectionAction = (value: string): value is SelectionActionId =>
  (SELECTION_ACTION_IDS as readonly string[]).includes(value);

/**
 * `@path` mentions in transcript prose. Shared by the renderer and the selection layer so both
 * produce the same characters: quotes around a spaced path and trailing punctuation are dropped.
 */
export function mentionParts(text: string): (string | { path: string; at: number })[] {
  const parts: (string | { path: string; at: number })[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/(^|\s)@(?:"([^"]+)"|([^\s]+))/g)) {
    const start = match.index! + match[1]!.length;
    parts.push(text.slice(cursor, start));
    parts.push({ path: (match[2] || match[3] || "").replace(/[.,;!?]+$/, ""), at: start });
    cursor = match.index! + match[0].length;
  }
  parts.push(text.slice(cursor));
  return parts;
}
export const hasMention = (text: string) => /(^|\s)@/.test(text);

type Style = Omit<SelectableRun, "start" | "end">;
export type SelectionSource = { text: string; runs: SelectableRun[] };

/**
 * The exact string and font runs `MessageContent` renders for one paragraph's inline nodes, so a
 * transparent native copy wraps line for line with the visible text. Null when the paragraph holds
 * something that is not text (a typeset formula), which keeps the system's own selection there.
 */
export function selectionSource(
  nodes: readonly MessageNode[],
  options: { compactMedia: boolean; mentions: boolean; codeSize: number },
): SelectionSource | null {
  let text = "";
  const runs: SelectableRun[] = [];
  const append = (value: string, style: Style) => {
    if (!value) return;
    const start = text.length;
    text += value;
    if (Object.keys(style).length) runs.push({ start, end: text.length, ...style });
  };
  const walk = (entries: readonly MessageNode[], style: Style): boolean => {
    for (const node of entries) {
      if (node.type === "math_inline" || node.type === "math_display") return false;
      if (node.type === "image") {
        if (!options.compactMedia) append(node.attrs.alt || node.text, style);
        continue;
      }
      if (node.type === "softbreak" || node.type === "hardbreak") {
        append("\n", style);
        continue;
      }
      // Links and other containers keep the surrounding font; only their color differs.
      if (node.type === "text" && options.mentions && hasMention(node.text)) {
        for (const part of mentionParts(node.text)) append(typeof part === "string" ? part : `@${part.path}`, style);
        continue;
      }
      const next: Style =
        node.type === "strong"
          ? { ...style, weight: "700" }
          : node.type === "em"
            ? { ...style, italic: true }
            : node.type === "s"
              ? { ...style, strike: true }
              : node.type === "code_inline"
                ? { ...style, mono: true, weight: "500", size: options.codeSize }
                : style;
      if (node.children.length) {
        if (!walk(node.children, next)) return false;
      } else append(node.text, next);
    }
    return true;
  };
  if (!walk(nodes, {})) return null;
  return { text, runs: mergeRuns(runs) };
}

/** Adjacent runs with the same style become one, so the native side applies fewer attributes. */
function mergeRuns(runs: SelectableRun[]): SelectableRun[] {
  const merged: SelectableRun[] = [];
  const same = (a: SelectableRun, b: SelectableRun) =>
    a.weight === b.weight && !!a.italic === !!b.italic && !!a.mono === !!b.mono && !!a.strike === !!b.strike && a.size === b.size;
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.end === run.start && same(last, run)) last.end = run.end;
    else merged.push({ ...run });
  }
  return merged;
}

export type ProseRect = { x: number; y: number; width: number; height: number };

/** The prose paragraph under a long-press (window coordinates), with the point made local to it. */
export function proseAt(rects: readonly { id: string; rect: ProseRect | null }[], x: number, y: number) {
  for (const { id, rect } of rects) {
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
      return { id, x: x - rect.x, y: y - rect.y };
  }
  return null;
}
