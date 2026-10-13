import type { HostTransport } from "@/remote/transport";
import { hostKey } from "@/state/host-request";

export type MessageContext = {
  client: HostTransport;
  machineId: string;
  projectId: string;
  sessionId?: string;
  cwd: string;
  basePath?: string;
};
export type OpenDocument = (path: string, context: MessageContext) => void;
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const mediaQueryKey = (context: MessageContext | undefined, key: readonly unknown[]) =>
  hostKey(context?.machineId ?? null, [
    "media",
    context?.client.machine.environmentId,
    context?.client.machine.endpoint,
    context?.projectId,
    context?.sessionId,
    context?.cwd,
    context?.basePath,
    ...key,
  ]);
export function mediaAccessRevoked(error: unknown) {
  const kind = error && typeof error === "object" && "kind" in error ? error.kind : undefined;
  return kind === "auth" || kind === "identity";
}
export function visibleMediaData<T>(query: {
  data: T | undefined;
  isError: boolean;
  error: unknown;
}): T | undefined {
  return query.isError && mediaAccessRevoked(query.error) ? undefined : query.data;
}

export function mediaMime(name: string) {
  const ext = name.split(/[?#]/)[0]!.split(".").pop()?.toLowerCase();
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        avif: "image/avif",
        svg: "image/svg+xml",
        html: "text/html",
        htm: "text/html",
        md: "text/markdown",
        markdown: "text/markdown",
        txt: "text/plain",
        json: "application/json",
        pdf: "application/pdf",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}

/** Resolve only within the selected project/worktree. Host validates symlinks too. */
export function resolveProjectPath(cwd: string, raw: string): string | null {
  let path = raw.trim();
  if (!cwd || !path || /[\u0000-\u001f]/.test(path)) return null;
  try {
    if (/^file:\/\//i.test(path))
      path = decodeURIComponent(new URL(path).pathname).replace(/^\/([a-z]:)/i, "$1");
    else path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/(?:#L?\d+(?:-L?\d+)?|:\d+(?::\d+)?)$/, "").replace(/\\/g, "/");
  const root = cwd.replace(/\\/g, "/").replace(/\/$/, "");
  const windows = /^[a-z]:/i.test(root);
  const compare = (v: string) => (windows ? v.toLowerCase() : v);
  if (/^(?:[a-z]:\/|\/)/i.test(path)) {
    if (compare(path) !== compare(root) && !compare(path).startsWith(compare(root) + "/"))
      return null;
    path = path.slice(root.length).replace(/^\//, "");
  } else if (/^[a-z][\w+.-]*:/i.test(path)) return null;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return `${root}/${parts.join("/")}`;
}

export function externalImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.includes(":") ||
      !host.includes(".") ||
      /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(host)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function resolveMediaPath(context: Pick<MessageContext, "cwd" | "basePath">, raw: string) {
  if (!context.basePath || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(raw))
    return resolveProjectPath(context.cwd, raw);
  const document = resolveProjectPath(context.cwd, context.basePath);
  return resolveProjectPath(
    context.cwd,
    (document?.slice(0, document.lastIndexOf("/") + 1) ?? context.cwd + "/") + raw,
  );
}

export function sandboxPreviewHtml(html: string, javascript = true, trustedRuntime = ""): string {
  if (html.length > MAX_HTML_BYTES) throw new Error("HTML preview exceeds 2 MiB.");
  const policy = `default-src 'none'; script-src ${javascript ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">`;
  // Prepend the policy before any untrusted markup, including malformed head tags.
  return `<!doctype html><html><head>${head}${trustedRuntime ? `<script>${trustedRuntime.replace(/<\/script/gi, "<\\/script")}</script>` : ""}</head><body>${html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b[^>]*>/gi, "")}</body></html>`;
}
export function previewNavigationAllowed(url: string) {
  return url === "about:blank" || url.startsWith("about:blank#");
}
