import type { MessageNode } from "./message-model";
import { resolveMediaPath, type MessageContext } from "./media-policy";

type Scope = Pick<MessageContext, "cwd" | "basePath">;
const textNode = (text: string): MessageNode => ({
  type: "text",
  tag: "",
  text,
  attrs: {},
  children: [],
});

function citations(text: string, scope: Scope): MessageNode[] {
  const result: MessageNode[] = [];
  const pattern =
    /:codex-file-citation\{((?:[^{}"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*)\}|\uE200visualize\uE202(\{[^\uE201]*\})\uE201/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match[0].length > 8192) continue;
    let target = "";
    if (match[2]) {
      try {
        const value: unknown = JSON.parse(match[2]);
        if (
          !value ||
          typeof value !== "object" ||
          !("path" in value) ||
          typeof value.path !== "string" ||
          !/\.html?$/i.test(value.path)
        )
          continue;
        target = value.path;
      } catch {
        continue;
      }
    } else {
      const attributes: Record<string, string> = {};
      const rest = match[1]!.replace(
        /([\w-]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
        (_, name: string, quoted: string) => {
          // Native Windows separators are not JSON escapes.
          attributes[name] = quoted.slice(1, -1);
          return "";
        },
      );
      if (rest.trim()) continue;
      target = attributes.path ?? "";
    }
    // The same project/worktree resolver used by media applies before creating any action.
    if (!target || /^[\\/]{2}/.test(target) || !resolveMediaPath(scope, target)) continue;
    if (match.index! > cursor) result.push(textNode(text.slice(cursor, match.index)));
    const label = target.replace(/\\/g, "/").split("/").pop() || target;
    result.push({
      type: "link",
      tag: "a",
      text: "",
      attrs: { href: target },
      children: [textNode(label)],
    });
    cursor = match.index! + match[0].length;
  }
  if (cursor < text.length) result.push(textNode(text.slice(cursor)));
  return result;
}

/** Translate complete output markers only in prose; cached AST nodes stay immutable and scope-free. */
export function scopedMessageReferences(nodes: MessageNode[], scope?: Scope): MessageNode[] {
  if (!scope) return nodes;
  return nodes.flatMap((node): MessageNode[] => {
    if (["link", "code_inline", "code_block", "fence", "image"].includes(node.type)) return [node];
    if (node.type === "text" && /codex-file-citation|\uE200visualize/.test(node.text))
      return citations(node.text, scope);
    return node.children.length
      ? [{ ...node, children: scopedMessageReferences(node.children, scope) }]
      : [node];
  });
}
