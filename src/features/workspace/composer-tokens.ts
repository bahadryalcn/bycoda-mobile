export type ComposerToken = { trigger: "/" | "$" | "@"; start: number; end: number; query: string };
export function composerTokenAt(text: string, selection: { start: number; end: number }): ComposerToken | null {
  if (selection.start !== selection.end) return null;
  const cursor = Math.max(0, Math.min(text.length, selection.start));
  let start = cursor; while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  const trigger = text[start]; if (trigger !== "/" && trigger !== "$" && trigger !== "@") return null;
  const prefix = text.slice(0, start); const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if (/^\s*>/.test(line) || (prefix.match(/^\s*```|^\s*~~~/gm)?.length ?? 0) % 2 || (line.match(/`/g)?.length ?? 0) % 2 || (line.match(/\$/g)?.length ?? 0) % 2) return null;
  const query = text.slice(start + 1, cursor);
  if (query.length > 120 || (trigger === "@" ? /[@"'<>]/.test(query) : !/^[\p{L}\p{N}_.:-]*$/u.test(query))) return null;
  if (trigger === "$" && text[cursor] === "$") return null;
  let end = cursor; while (end < text.length && !/\s/.test(text[end]!)) end++;
  return { trigger, start, end, query };
}
export function replaceComposerToken(text: string, token: ComposerToken, label: string) {
  const value = `${token.trigger}${label}`;
  const suffix = text.slice(token.end);
  const separator = /^\s/.test(suffix) ? "" : " ";
  return { text: text.slice(0, token.start) + value + separator + suffix, cursor: token.start + value.length + (separator.length || (suffix.startsWith(" ") ? 1 : 0)) };
}
export function mentionLabel(path: string) { return /\s/.test(path) ? `"${path.replace(/"/g, "\\\"")}"` : path; }
