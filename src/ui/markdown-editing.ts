/**
 * Pure helpers behind the live markdown editor. The text stays plain markdown:
 * styling only decorates it, so what is saved is byte-for-byte what was typed.
 * Toolbar edits reuse the desktop note editor's transforms.
 */
export {
  markdownEdit,
  type MarkdownCommand,
  type MarkdownEdit,
} from "../../../src/features/notes/markdownCommands";

export type MarkdownTone =
  | "marker"
  | "h1"
  | "h2"
  | "h3"
  | "strong"
  | "em"
  | "strike"
  | "code"
  | "fence"
  | "link"
  | "quote"
  | "done"
  | "rule";

/** One run of source text and the decorations that apply to it. */
export type MarkdownSpan = { text: string; tones: readonly MarkdownTone[] };

/** Above this size the editor shows plain text so typing stays responsive. */
export const MARKDOWN_STYLE_LIMIT = 40_000;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(\s{0,3}#{1,6}[ \t]+)(.*)$/;
const RULE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^(\s*>[ \t]?)(.*)$/;
const LIST = /^(\s*(?:[-*+] \[([ xX])\] |[-*+] |\d+[.)] ))(.*)$/;
// Code first so markers inside it stay literal; links before emphasis so `*` in a URL is not read as italics.
const INLINE =
  /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|\*\*([^\s*](?:[\s\S]*?[^\s])?)\*\*|~~([^\s~](?:[\s\S]*?[^\s])?)~~|\*([^\s*](?:[^*]*?[^\s*])?)\*/g;

function push(spans: MarkdownSpan[], text: string, tones: readonly MarkdownTone[]) {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && last.tones.length === tones.length && last.tones.every((tone, index) => tone === tones[index]))
    spans[spans.length - 1] = { text: last.text + text, tones: last.tones };
  else spans.push({ text, tones });
}

function inline(spans: MarkdownSpan[], text: string, tones: readonly MarkdownTone[]) {
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    push(spans, text.slice(index, start), tones);
    const [whole, ticks, code, label, url, bare, strong, strike, em] = match;
    if (ticks !== undefined && code !== undefined) {
      push(spans, ticks, [...tones, "marker"]);
      push(spans, code, [...tones, "code"]);
      push(spans, ticks, [...tones, "marker"]);
    } else if (label !== undefined && url !== undefined) {
      push(spans, "[", [...tones, "marker"]);
      inline(spans, label, [...tones, "link"]);
      push(spans, `](${url})`, [...tones, "marker"]);
    } else if (bare !== undefined) push(spans, bare, [...tones, "link"]);
    else {
      const [marker, content, tone]: [string, string, MarkdownTone] =
        strong !== undefined ? ["**", strong, "strong"]
          : strike !== undefined ? ["~~", strike, "strike"]
            : ["*", em ?? "", "em"];
      push(spans, marker, [...tones, "marker"]);
      inline(spans, content, [...tones, tone]);
      push(spans, marker, [...tones, "marker"]);
    }
    index = start + whole.length;
  }
  push(spans, text.slice(index), tones);
}

/** Splits markdown into styled runs whose text joins back to exactly `text`. */
export function markdownSpans(text: string): MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  let fence: string | null = null;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) push(spans, "\n", []);
    const opener = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
        push(spans, line, ["marker"]);
      } else push(spans, line, ["fence"]);
      return;
    }
    if (opener) {
      fence = opener;
      push(spans, line, ["marker"]);
      return;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.trim().length;
      const tone: MarkdownTone = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      push(spans, heading[1]!, [tone, "marker"]);
      inline(spans, heading[2]!, [tone]);
      return;
    }
    if (RULE.test(line)) {
      push(spans, line, ["rule"]);
      return;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      push(spans, quote[1]!, ["marker"]);
      inline(spans, quote[2]!, ["quote"]);
      return;
    }
    const list = LIST.exec(line);
    if (list) {
      push(spans, list[1]!, ["marker"]);
      inline(spans, list[3]!, list[2] === "x" || list[2] === "X" ? ["done"] : []);
      return;
    }
    inline(spans, line, []);
  });
  return spans;
}

function insideFence(text: string, lineStart: number): boolean {
  let fence: string | null = null;
  for (const line of text.slice(0, lineStart).split("\n")) {
    const opener = FENCE.exec(line)?.[1];
    if (!opener) continue;
    if (fence === null) fence = opener;
    else if (opener[0] === fence[0] && opener.length >= fence.length) fence = null;
  }
  return fence !== null;
}

const LIST_ITEM = /^(\s*)(?:([-*+]) \[[ xX]\] |([-*+]) |(\d+)([.)]) )(.*)$/;

/**
 * Return inside a list item starts the next item (numbers count on, checklists
 * start unchecked); Return on an empty item ends the list. Read off the text
 * change, because a key event in a native field cannot be prevented.
 */
export function continueMarkdownList(
  previous: string,
  next: string,
): { text: string; caret: number } | null {
  if (next.length !== previous.length + 1) return null;
  let at = 0;
  while (at < previous.length && previous[at] === next[at]) at += 1;
  if (next[at] !== "\n" || next.slice(at + 1) !== previous.slice(at)) return null;
  const lineStart = next.lastIndexOf("\n", at - 1) + 1;
  if (insideFence(next, lineStart)) return null;
  const item = LIST_ITEM.exec(next.slice(lineStart, at));
  if (!item) return null;
  const [, indent, check, bullet, number, delimiter, rest] = item;
  if (!rest!.trim() && !next.slice(at + 1).split("\n", 1)[0]!.trim()) {
    // An empty item ends the list: drop its marker and the new line break.
    return { text: previous.slice(0, lineStart) + previous.slice(at), caret: lineStart };
  }
  const marker = check
    ? `${check} [ ] `
    : bullet
      ? `${bullet} `
      : `${Number(number) + 1}${delimiter} `;
  const continuation = `${indent}${marker}`;
  return {
    text: next.slice(0, at + 1) + continuation + next.slice(at + 1),
    caret: at + 1 + continuation.length,
  };
}
