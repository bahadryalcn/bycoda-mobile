export type CodeToken = { text: string; kind: "plain" | "string" | "comment" | "keyword" | "number" };
/** A bounded lexical accent pass; unknown languages remain faithful plain text. */
export function highlightCode(code: string, language: string): CodeToken[] {
  if (code.length > 32_000 || !/^(?:js|jsx|javascript|ts|tsx|typescript|json|css|python|py|sh|bash|sql)$/i.test(language)) return [{ text: code, kind: "plain" }];
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?:^|\n)\s*#[^\n]*)|\b(const|let|var|function|return|if|else|async|await|import|from|export|default|class|new|throw|try|catch|true|false|null|undefined|def|for|in|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b|\b(\d+(?:\.\d+)?)\b/g;
  const out: CodeToken[] = []; let cursor = 0;
  for (const match of code.matchAll(pattern)) { if (match.index! > cursor) out.push({ text: code.slice(cursor, match.index), kind: "plain" }); out.push({ text: match[0], kind: match[1] ? "string" : match[2] ? "comment" : match[3] ? "keyword" : "number" }); cursor = match.index! + match[0].length; }
  if (cursor < code.length) out.push({ text: code.slice(cursor), kind: "plain" }); return out;
}
