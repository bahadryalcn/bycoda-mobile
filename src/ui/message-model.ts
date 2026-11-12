import MarkdownIt from "markdown-it";
import { inlineRaster } from "./inline-raster";
import { readLink } from "./message-inline";

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
// Local file references often contain unescaped spaces or balanced parentheses.
// Parse them only in prose; the renderer still owns project-scope/access checks.
parser.inline.ruler.before("link", "scoped_file_link", (state, silent) => {
  if (state.src[state.pos] !== "[" || state.linkLevel > 0) return false;
  const link = readLink(state.src, state.pos);
  if (!link || link.target.kind !== "file") return false;
  if (!silent) {
    state.push("link_open", "a", 1).attrs = [["href", link.target.context]];
    state.push("text", "", 0).content = link.text;
    state.push("link_close", "a", -1);
  }
  state.pos = link.end;
  return true;
});
// Provider memory citations are transport metadata, not conversation prose.
// Run after Markdown's fence/code rules so literal examples remain untouched.
parser.block.ruler.before("paragraph", "internal_memory_citation", (state, startLine, endLine, silent) => {
  if (!state.env.hideInternalMetadata || state.parentType !== "root") return false;
  const lineText = (line: number) => state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]);
  if (lineText(startLine).trim() !== "<oai-mem-citation>") return false;
  for (let line = startLine + 1; line < endLine; line++) {
    if (lineText(line).trim() !== "</oai-mem-citation>") continue;
    const body = state.src.slice(state.bMarks[startLine + 1], state.bMarks[line]);
    if (!/^\s*<citation_entries>[\s\S]*?<\/citation_entries>\s*<rollout_ids>[\s\S]*?<\/rollout_ids>\s*$/.test(body)) return false;
    if (!silent) {
      (state.env.metadataLineRanges as [number, number][] | undefined)?.push([startLine, line + 1]);
      state.line = line + 1;
    }
    return true;
  }
  return false;
});
// File links are interpreted by our scoped native resolver, never by a browser.
parser.validateLink = (url) =>
  /^data:/i.test(url.trim())
    ? inlineRaster(url) !== null
    : !/^(?:javascript|vbscript|content):/i.test(url.trim());
type CacheEntry = { digest: string; nodes: MessageNode[]; size: number };
const cache = new Map<string, CacheEntry>();
let cachedCharacters = 0;
const CACHE_ENTRIES = 400;
const CACHE_CHARACTERS = 3_000_000;
export const MESSAGE_RENDER_LIMIT = 256_000;

/** Cheap content fingerprint (length + FNV-1a); far cheaper than a Markdown parse. */
export function messageDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

/** Cache slot. A block id owns one slot, so streaming one message replaces only itself. */
export function messageCacheKey(hideInternalMetadata: boolean, id?: string, source = ""): string {
  const mode = hideInternalMetadata ? "assistant" : "literal";
  return id === undefined ? `${mode}:text:${source}` : `${mode}:id:${id}`;
}

function tree(tokens: Token[], source: string): MessageNode[] {
  const root: MessageNode[] = [];
  const stack: MessageNode[][] = [root];
  let sourceLines: string[] | undefined;
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
      const lines = sourceLines ??= source.split("\n");
      const last = lines[(token.map?.[1] ?? 0) - 1]?.trim() ?? "";
      node.complete =
        last.startsWith(token.markup) && (token.map?.[1] ?? 0) > (token.map?.[0] ?? 0) + 1;
    }
    stack[stack.length - 1]!.push(node);
    if (token.nesting > 0) stack.push(node.children);
  }
  return root;
}

/**
 * Bounded native AST. Ordinary Markdown never becomes executable HTML.
 * `cacheId` (the block id) keys the cache by identity plus a content digest instead of the
 * whole text, so a streaming message occupies one slot and never evicts the others.
 */
export function parseMessage(text: string, hideInternalMetadata = false, cacheId?: string): MessageNode[] {
  const source = text.slice(0, MESSAGE_RENDER_LIMIT);
  const key = messageCacheKey(hideInternalMetadata, cacheId, source);
  const digest = cacheId === undefined ? "" : messageDigest(source);
  const found = cache.get(key);
  if (found && found.digest === digest) {
    // Refresh recency so actively viewed messages outlive stale ones.
    cache.delete(key);
    cache.set(key, found);
    return found.nodes;
  }
  const nodes = tree(parser.parse(source, { hideInternalMetadata }) as Token[], source);
  if (found) {
    cache.delete(key);
    cachedCharacters -= found.size;
  }
  const size = source.length;
  while (cache.size >= CACHE_ENTRIES || cachedCharacters + size > CACHE_CHARACTERS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cachedCharacters -= cache.get(oldest)!.size;
    cache.delete(oldest);
  }
  cache.set(key, { digest, nodes, size });
  cachedCharacters += size;
  return nodes;
}
/** Presentation-only source for the long reader; callers keep original text for copy. */
export function messageDisplaySource(text: string): string {
  if (!text.includes("<oai-mem-citation>")) return text;
  const metadataLineRanges: [number, number][] = [];
  parser.block.parse(text.replace(/\r\n?/g, "\n"), parser, { hideInternalMetadata: true, metadataLineRanges }, []);
  const lineOffsets = [0];
  for (const newline of text.matchAll(/\r\n?|\n/g)) lineOffsets.push(newline.index + newline[0].length);
  let result = "";
  let offset = 0;
  for (const [start, end] of metadataLineRanges) {
    result += text.slice(offset, lineOffsets[start]);
    offset = lineOffsets[end] ?? text.length;
  }
  return result + text.slice(offset);
}
export function messageNodeText(node: MessageNode): string {
  return node.text || node.children.map(messageNodeText).join("");
}
