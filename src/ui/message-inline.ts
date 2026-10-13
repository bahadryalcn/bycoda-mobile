export type MarkdownTarget =
  | { kind: "web"; href: string; context: string }
  | { kind: "file"; context: string }
  | { kind: "unavailable" };

export type MessageInlinePart =
  | { kind: "text" | "bold" | "code"; text: string }
  | { kind: "link"; text: string; target: MarkdownTarget };

/** Web URLs and scoped file candidates are distinct; callers must resolve file scope. */
export function markdownTarget(raw: string): MarkdownTarget {
  const target = raw.trim().replace(/^<([\s\S]+)>$/, "$1");
  if (!target || /[\u0000-\u001f\u007f]/.test(target)) return { kind: "unavailable" };
  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:"))
        return { kind: "unavailable" };
      // Never expose or forward URL userinfo supplied in a transcript.
      url.username = "";
      url.password = "";
      return { kind: "web", href: url.href, context: url.href };
    } catch {
      return { kind: "unavailable" };
    }
  }
  if (/^file:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      url.username = "";
      url.password = "";
      return { kind: "file", context: url.href };
    } catch {
      return { kind: "unavailable" };
    }
  }
  if (/^[a-z]:[\\/]/i.test(target) || /^(?:\/|\\\\|\.\.?[\\/])/.test(target)) {
    return { kind: "file", context: target };
  }
  // A bare filename plus a source location is a file candidate, not a URI scheme.
  if (/^[^:\/\\\s]+\.[a-z\d]{1,12}:\d+(?::\d+)?$/i.test(target)) {
    return { kind: "file", context: target };
  }
  // Other relative repository paths and file names are checked by the caller's root resolver.
  if (
    !/^[a-z][\w+.-]*:/i.test(target) &&
    /(?:[\\/]|\.[a-z\d]{1,12}(?::\d+)?(?:#.*)?$)/i.test(target)
  ) {
    return { kind: "file", context: target };
  }
  return { kind: "unavailable" };
}

function readLink(text: string, start: number) {
  const relativeEnd = text.slice(start + 1, start + 1025).indexOf("](");
  if (relativeEnd < 0) return;
  const labelEnd = start + 1 + relativeEnd;
  if (text.slice(start + 1, labelEnd).includes("\n")) return;
  let depth = 1;
  let angle = false;
  const targetStart = labelEnd + 2;
  for (let end = targetStart; end < Math.min(text.length, targetStart + 8192); end++) {
    const character = text[end];
    if (character === "\n") return;
    if (character === "<" && end === targetStart) angle = true;
    if (character === ">") angle = false;
    if (angle) continue;
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) {
      const label = text.slice(start + 1, labelEnd);
      const target = markdownTarget(text.slice(targetStart, end));
      // URL-shaped labels receive the same userinfo sanitization as destinations.
      const labelTarget = markdownTarget(label);
      return {
        end: end + 1,
        text: labelTarget.kind === "web" ? labelTarget.context : label,
        target,
      };
    }
  }
}

/** Parse inline prose only; code spans keep Markdown links literally unchanged. */
export function messageInlineParts(text: string): MessageInlinePart[] {
  const parts: MessageInlinePart[] = [];
  let plain = "";
  const flush = () => {
    if (plain) parts.push({ kind: "text", text: plain });
    plain = "";
  };
  for (let index = 0; index < text.length;) {
    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        parts.push({ kind: "code", text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        flush();
        parts.push({ kind: "bold", text: text.slice(index + 2, end) });
        index = end + 2;
        continue;
      }
    }
    if (text[index] === "[") {
      const link = readLink(text, index);
      if (link) {
        flush();
        parts.push({ kind: "link", text: link.text, target: link.target });
        index = link.end;
        continue;
      }
    }
    plain += text[index];
    index++;
  }
  flush();
  return parts;
}
