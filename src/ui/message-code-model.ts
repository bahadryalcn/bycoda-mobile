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
  return { text: preview, lineCount: Math.max(1, count), truncated: preview.length < code.length };
}


/** Preview eligibility uses the complete source, never an individual reader page. */
export function codePreviewKind(code: string, language: string, complete = true): "html" | "diagram" | null {
  if (!complete) return null;
  if (/^(?:html|htm)$/i.test(language) && code.length <= 2 * 1024 * 1024) return "html";
  return language.toLowerCase() === "mermaid" ? "diagram" : null;
}
