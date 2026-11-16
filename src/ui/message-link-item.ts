import { markdownTarget } from "./message-inline";
import { messageSessionLink } from "./message-session-link";
import { messageNodeText, type MessageNode } from "./message-model";

export type LinkOnlyItem = { href: string; title: string; host: string };

const flatten = (nodes: MessageNode[]): MessageNode[] =>
  nodes.flatMap((node) => (node.type === "inline" ? flatten(node.children) : [node]));

/**
 * A list item whose only content is one web link, as in a source list. Mixed content,
 * several links, images, nested blocks and file links keep the ordinary paragraph rendering.
 */
export function linkOnlyItem(item: MessageNode): LinkOnlyItem | null {
  if (item.children.length !== 1) return null;
  const paragraph = item.children[0]!;
  if (paragraph.type !== "paragraph") return null;
  const parts = flatten(paragraph.children).filter(
    (node) => !(node.type === "text" && !node.text.trim()),
  );
  if (parts.length !== 1 || parts[0]!.type !== "link") return null;
  const link = parts[0]!;
  const href = link.attrs.href || "";
  // Session references open in the app, not as an external source card.
  if (messageSessionLink(href)) return null;
  const target = markdownTarget(href);
  if (target.kind !== "web") return null;
  const host = new URL(target.href).hostname.replace(/^www\./, "");
  const title = messageNodeText(link).trim() || host;
  return { href: target.href, title, host };
}

/**
 * A list made only of web links, two or more, is a source list. A single link stays an
 * ordinary row: folding one link under "1 source" hides more than it tidies.
 */
export function sourceList(items: readonly MessageNode[]): LinkOnlyItem[] | null {
  if (items.length < 2) return null;
  const links: LinkOnlyItem[] = [];
  for (const item of items) {
    const link = linkOnlyItem(item);
    if (!link) return null;
    links.push(link);
  }
  return links;
}
