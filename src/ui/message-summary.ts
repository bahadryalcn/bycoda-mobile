import { parseMessage, type MessageNode } from "./message-model";

/** Plain text for collapsed rows. Full Markdown remains available in the detail reader. */
export function messageSummary(source: string): string {
  const read = (nodes: MessageNode[]): string => nodes.map((node) => {
    if (node.type === "softbreak" || node.type === "hardbreak") return " ";
    const text = node.children.length ? read(node.children) : node.text;
    // Inline emphasis and links must not insert spaces inside a word.
    return ["paragraph", "heading", "list_item", "fence", "code_block", "tr"].includes(node.type)
      ? `${text} `
      : text;
  }).join("");
  return read(parseMessage(source, true)).replace(/\s+/g, " ").trim();
}
