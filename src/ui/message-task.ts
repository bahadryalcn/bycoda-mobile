import type { MessageNode } from "./message-model";

export type TaskListItem = { checked: boolean; children: MessageNode[] };

const MARKER = /^\[([ xX])\](?:[ \t]+|$)/;

/**
 * GFM task item: `[ ]` / `[x]` opening the item's first paragraph, followed by whitespace or a
 * line break. Returns the item's blocks with the marker removed so it renders as a checkbox.
 */
export function taskListItem(item: MessageNode): TaskListItem | null {
  const paragraphIndex = item.children.findIndex((entry) => entry.type === "paragraph");
  if (paragraphIndex !== 0) return null;
  const paragraph = item.children[0]!;
  const inline = paragraph.children[0];
  if (inline?.type !== "inline") return null;
  const [first, next] = inline.children;
  if (first?.type !== "text") return null;
  const match = MARKER.exec(first.text);
  if (!match) return null;
  const rest = first.text.slice(match[0].length);
  // `[x]` alone at the end of its line is a marker only when the item continues below it.
  if (!rest && match[0].length === 3 && next?.type !== "softbreak" && next?.type !== "hardbreak")
    return null;
  const parts = inline.children.slice(1);
  if (rest) parts.unshift({ ...first, text: rest });
  else if (parts[0]?.type === "softbreak" || parts[0]?.type === "hardbreak") parts.shift();
  return {
    checked: match[1] !== " ",
    children: [
      {
        ...paragraph,
        children: [
          // The inline node also keeps its raw source; strip the marker there for plain-text readers.
          { ...inline, text: inline.text.replace(/^\[[ xX]\][ \t]*(?:\r?\n)?/, ""), children: parts },
          ...paragraph.children.slice(1),
        ],
      },
      ...item.children.slice(1),
    ],
  };
}
