import { parseMessage, type MessageNode } from "./message-model";

/** Plain text for collapsed rows. Full Markdown remains available in the detail reader. */
export function messageSummary(
  source: string,
  { hideInternalMetadata = true, omitLeadingHeadingMatching }: {
    hideInternalMetadata?: boolean;
    omitLeadingHeadingMatching?: string;
  } = {},
): string {
  const read = (nodes: MessageNode[]): string => nodes.map((node) => {
    if (node.type === "softbreak" || node.type === "hardbreak") return " ";
    const text = node.children.length ? read(node.children) : node.text;
    // Inline emphasis and links must not insert spaces inside a word.
    return ["paragraph", "heading", "list_item", "fence", "code_block", "tr"].includes(node.type)
      ? `${text} `
      : text;
  }).join("");
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const nodes = parseMessage(source, hideInternalMetadata);
  const first = nodes[0];
  const repeatsTitle = first?.type === "heading" && !!omitLeadingHeadingMatching &&
    normalize(read([first])) === normalize(omitLeadingHeadingMatching);
  return normalize(read(repeatsTitle ? nodes.slice(1) : nodes));
}
