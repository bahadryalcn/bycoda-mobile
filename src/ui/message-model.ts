import MarkdownIt from "markdown-it";
import { inlineRaster } from "./inline-raster";

export type MessageNode = {
  type: string;
  tag: string;
  text: string;
  attrs: Record<string, string>;
  children: MessageNode[];
  complete?: boolean;
};
type Token = {
  type: string;
  tag: string;
  content: string;
  nesting: number;
  attrs: [string, string][] | null;
  children: Token[] | null;
  info: string;
  markup: string;
  map: [number, number] | null;
};
const parser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  maxNesting: 24,
});
// File links are interpreted by our scoped native resolver, never by a browser.
parser.validateLink = (url) =>
  /^data:/i.test(url.trim())
    ? inlineRaster(url) !== null
    : !/^(?:javascript|vbscript|content):/i.test(url.trim());
const cache = new Map<string, MessageNode[]>();
let cachedCharacters = 0;

function tree(tokens: Token[], source: string): MessageNode[] {
  const root: MessageNode[] = [];
  const stack: MessageNode[][] = [root];
  for (const token of tokens) {
    if (token.nesting < 0) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node: MessageNode = {
      type: token.type.replace(/_open$/, ""),
      tag: token.tag,
      text: token.content,
      attrs: Object.fromEntries(token.attrs ?? []),
      children: token.children ? tree(token.children, source) : [],
    };
    if (token.type === "fence") {
      node.attrs.language = token.info.trim().split(/\s/)[0] ?? "";
      const lines = source.split("\n");
      const last = lines[(token.map?.[1] ?? 0) - 1]?.trim() ?? "";
      node.complete =
        last.startsWith(token.markup) && (token.map?.[1] ?? 0) > (token.map?.[0] ?? 0) + 1;
    }
    stack[stack.length - 1]!.push(node);
    if (token.nesting > 0) stack.push(node.children);
  }
  return root;
}

/** Bounded native AST. Ordinary Markdown never becomes executable HTML. */
export function parseMessage(text: string): MessageNode[] {
  const source = text.slice(0, 256_000);
  const found = cache.get(source);
  if (found) return found;
  const result = tree(parser.parse(source, {}) as Token[], source);
  while (cache.size >= 24 || cachedCharacters + source.length > 1_000_000) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cachedCharacters -= oldest.length;
    cache.delete(oldest);
  }
  cache.set(source, result);
  cachedCharacters += source.length;
  return result;
}
export function messageNodeText(node: MessageNode): string {
  return node.text || node.children.map(messageNodeText).join("");
}
