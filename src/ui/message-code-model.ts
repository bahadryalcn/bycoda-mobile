/** Keep UTF-16 page/preview boundaries from splitting emoji or other supplementary characters. */
export function sourceSlice(source: string, start: number, end: number) {
  const boundary = (offset: number) => offset > 0 && offset < source.length &&
    source.charCodeAt(offset) >= 0xdc00 && source.charCodeAt(offset) <= 0xdfff &&
    source.charCodeAt(offset - 1) >= 0xd800 && source.charCodeAt(offset - 1) <= 0xdbff
    ? offset - 1 : offset;
  return source.slice(boundary(start), boundary(end));
}

/** Preview limits bound transcript work without altering the source copied or opened. */
export function codePreview(code: string, lineLimit = 8, characterLimit = 2400) {
  const lines = code.split("\n");
  const count = lines.length - (code.endsWith("\n") ? 1 : 0);
  const selected = lines.slice(0, lineLimit).join("\n");
  const preview = sourceSlice(selected, 0, characterLimit);
  // The newline that ends the last line is not hidden content: a fence body always ends with one.
  const body = code.endsWith("\n") ? code.slice(0, -1) : code;
  return { text: preview, lineCount: Math.max(1, count), truncated: preview.length < body.length };
}

/**
 * Source as a code block shows it: without the newline that ends its last line (a Markdown fence
 * body always has one), which would otherwise render as an empty last row. Copy keeps the original.
 */
export function codeDisplayText(code: string): string {
  return code.replace(/\r?\n$/, "");
}

/** Blocks up to this size expand in place; longer ones open the full-screen reader instead. */
export const CODE_INLINE_EXPAND_LINES = 60;
export const CODE_INLINE_EXPAND_CHARACTERS = 6000;

/**
 * How a message code block discloses its source: `whole` when it barely exceeds the collapsed
 * height (two extra lines are not worth a step), `inline` when it can expand in the message, and
 * `reader` when it is long enough to need the paged full-screen reader.
 */
export function codeDisclosure(code: string, collapsedLines = 8) {
  const whole = codePreview(code, collapsedLines + 2);
  if (!whole.truncated) return { mode: "whole" as const, text: code, lineCount: whole.lineCount, hiddenLines: 0 };
  const preview = codePreview(code, collapsedLines);
  const shownLines = preview.text.split("\n").length;
  const inline = preview.lineCount <= CODE_INLINE_EXPAND_LINES && code.length <= CODE_INLINE_EXPAND_CHARACTERS;
  return {
    mode: inline ? ("inline" as const) : ("reader" as const),
    text: preview.text,
    lineCount: preview.lineCount,
    hiddenLines: Math.max(0, preview.lineCount - shownLines),
  };
}

/** Preview eligibility uses the complete source, never an individual reader page. */
export function codePreviewKind(code: string, language: string, complete = true): "html" | "diagram" | null {
  if (!complete) return null;
  if (/^(?:html|htm)$/i.test(language) && code.length <= 2 * 1024 * 1024) return "html";
  return language.toLowerCase() === "mermaid" ? "diagram" : null;
}
