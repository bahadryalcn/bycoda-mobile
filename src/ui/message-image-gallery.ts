import type { MessageNode } from "./message-model";
import { linkOnlyItem, sourceList } from "./message-link-item";
import { taskListItem } from "./message-task";
import type { MediaPageStatus } from "./media-gallery-model";

/** Deepest block level `MessageContent` renders; images below it are never shown, so never paged. */
const MAX_RENDER_DEPTH = 24;

const inlineOf = (nodes: readonly MessageNode[]) =>
  nodes.flatMap((entry) => (entry.type === "inline" ? entry.children : [entry]));

/**
 * The images a message shows below its paragraphs and headings, in reading order: the pages of its
 * gallery, so tapping the third image opens page 3 of the same set. Mirrors `MessageContent`'s
 * block walk: tables, code, formulas and source/link-only list rows draw no image frames.
 */
export function messageImageNodes(nodes: readonly MessageNode[]): MessageNode[] {
  const found: MessageNode[] = [];
  const inline = (entries: readonly MessageNode[]) => {
    for (const node of entries) {
      if (node.type === "image") found.push(node);
      else if (node.children.length) inline(node.children);
    }
  };
  const blocks = (entries: readonly MessageNode[], depth: number) => {
    if (depth > MAX_RENDER_DEPTH) return;
    for (const node of entries) {
      if (node.type === "paragraph" || node.type === "heading") inline(inlineOf(node.children));
      else if (node.type === "bullet_list" || node.type === "ordered_list") {
        if (sourceList(node.children)) continue;
        for (const item of node.children) {
          const task = taskListItem(item);
          if (!task && linkOnlyItem(item)) continue;
          blocks(task ? task.children : item.children, depth + 1);
        }
      } else if (!["table", "fence", "code_block", "math_block", "hr"].includes(node.type))
        blocks(node.children, depth + 1);
    }
  };
  blocks(nodes, 0);
  return found;
}

/** Where a Markdown image's pixels come from. */
export type MessageImageKind = "note" | "data" | "external" | "project";

export function messageImageKind(source: string, external: boolean): MessageImageKind {
  if (source.startsWith("/note-assets/")) return "note";
  if (/^data:/i.test(source)) return "data";
  return external ? "external" : "project";
}

/**
 * One gallery page of a message image: the local or embedded `uri` once there is one, otherwise
 * why there is none. An external image waits for the owner's consent (`download`), like the inline
 * "Load image" button; a project image without a computer to read it from is unavailable.
 */
export function messageGalleryPage(input: {
  kind: MessageImageKind;
  uri?: string;
  hasContext: boolean;
  allowed: boolean;
  failed: boolean;
}): { uri?: string; status?: MediaPageStatus } {
  if (input.kind === "note") return { status: "unavailable" };
  if (input.kind === "external" && !input.allowed) return { status: "download" };
  if (input.uri) return { uri: input.uri };
  if (input.kind === "data" || input.kind === "external") return { status: "unavailable" };
  if (!input.hasContext) return { status: "unavailable" };
  return { status: input.failed ? "failed" : "loading" };
}
