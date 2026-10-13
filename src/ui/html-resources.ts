import { mediaMime, resolveProjectPath, type MessageContext } from "./media-policy";

/** Inline a bounded set of project-owned resources; preview itself never gets host access. */
export async function bundleHtmlResources(html: string, name: string, context: MessageContext, signal?: AbortSignal) {
  const documentPath = resolveProjectPath(context.cwd, name);
  const base = documentPath?.slice(0, documentPath.lastIndexOf("/") + 1) ?? context.cwd + "/";
  let bundled = html; let unavailable = 0; let used = 0; let length = html.length;
  const resources = Array.from(html.matchAll(/<(img|script|link)\b[^>]*?\b(src|href)\s*=\s*(["'])(.*?)\3[^>]*>(?:<\/script\s*>)?/gi));
  for (const match of resources) {
    const url = match[4]!; if (/^(?:data:|blob:|#)/i.test(url)) continue;
    if (signal?.aborted) throw new Error("Preview cancelled.");
    if (used++ >= 12 || /^(?:https?:)?\/\//i.test(url) || /^[a-z][\w+.-]*:/i.test(url)) { unavailable++; continue; }
    const path = resolveProjectPath(context.cwd, base + url);
    if (!path) { unavailable++; continue; }
    const tag = match[1]!.toLowerCase();
    if (tag === "link" && !/rel\s*=\s*["']stylesheet["']/i.test(match[0])) continue;
    try {
      const value = await context.client.request<string>("workspace.run", { command: tag === "img" ? "read_binary_file" : "read_text_file", args: { path } }, { signal });
      if (typeof value !== "string" || (length += value.length) > 2 * 1024 * 1024) { unavailable++; continue; }
      if (tag === "img") {
        const mime = mediaMime(path); if (!mime.startsWith("image/") || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) { unavailable++; continue; }
        bundled = bundled.replace(match[0], match[0].replace(`${match[3]}${url}${match[3]}`, `"data:${mime};base64,${value}"`));
      } else if (tag === "script") bundled = bundled.replace(match[0], `<script>${value.replace(/<\/script/gi, "<\\/script")}</script>`);
      else { bundled = bundled.replace(match[0], `<style>${value}</style>`); if (/url\s*\((?!\s*["']?data:)/i.test(value)) unavailable++; }
    } catch (error) { if (signal?.aborted) throw error; unavailable++; }
  }
  return { html: bundled, unavailable };
}
