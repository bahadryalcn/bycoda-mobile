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

export const projectMediaQueryKey = (context: MessageContext, path: string) => mediaQueryKey(context, [
  "project-media", context.machineId, context.projectId, context.sessionId, context.cwd, context.basePath, path,
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

const binaryMimeTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", heic: "image/heic", heif: "image/heif",
  ico: "image/x-icon", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
  // SVG uses the media reader because its active source must never enter the editable text flow by default.
  svg: "image/svg+xml", pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation", epub: "application/epub+zip",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aiff: "audio/aiff",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mkv: "video/x-matroska", avi: "video/x-msvideo", mpg: "video/mpeg", mpeg: "video/mpeg",
  zip: "application/zip", gz: "application/gzip", tgz: "application/gzip", tar: "application/x-tar",
  "7z": "application/x-7z-compressed", rar: "application/vnd.rar", bz2: "application/x-bzip2",
  xz: "application/x-xz", zst: "application/zstd", br: "application/x-brotli",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  sqlite: "application/vnd.sqlite3", sqlite3: "application/vnd.sqlite3", db: "application/vnd.sqlite3", db3: "application/vnd.sqlite3",
  exe: "application/vnd.microsoft.portable-executable", dll: "application/vnd.microsoft.portable-executable",
  wasm: "application/wasm", bin: "application/octet-stream", dat: "application/octet-stream",
  ds_store: "application/octet-stream", psd: "image/vnd.adobe.photoshop", ai: "application/postscript",
  sketch: "application/octet-stream", fig: "application/octet-stream", icns: "image/icns",
};
const textMimeTypes: Record<string, string> = {
  html: "text/html", htm: "text/html", md: "text/markdown", markdown: "text/markdown",
  json: "application/json", csv: "text/csv", tsv: "text/tab-separated-values", xml: "text/xml",
  css: "text/css", js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript",
};
const textExtensions = new Set([
  "txt", "log", "ts", "tsx", "jsx", "mts", "cts", "jsonc", "jsonl", "yaml", "yml", "toml", "ini", "conf", "cfg",
  "env", "properties", "lock", "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "py", "pyi", "rs", "go",
  "java", "kt", "kts", "swift", "m", "mm", "c", "h", "cc", "cpp", "hpp", "cs", "fs", "fsx", "vb", "php", "rb",
  "r", "lua", "pl", "sql", "graphql", "gql", "proto", "vue", "svelte", "scss", "sass", "less", "tex", "rst", "adoc",
  "ipynb", "dockerfile", "makefile", "gitignore", "gitattributes", "editorconfig",
]);

function fileExtension(name: string) {
  const path = name.split(/[?#]/)[0]!.replace(/:\d+(?::\d+)?$/, "");
  const leaf = path.replaceAll("\\", "/").split("/").pop() ?? "";
  return leaf.includes(".") ? leaf.split(".").pop()!.toLowerCase() : "";
}

/** One file dispatch owner for file inspection, editing, message links and sharing. */
export function isBinaryDocument(name: string): boolean {
  return Object.hasOwn(binaryMimeTypes, fileExtension(name));
}

export function mediaMime(name: string): string {
  const extension = fileExtension(name);
  if (Object.hasOwn(binaryMimeTypes, extension)) return binaryMimeTypes[extension]!;
  if (Object.hasOwn(textMimeTypes, extension)) return textMimeTypes[extension]!;
  return textExtensions.has(extension) ? "text/plain" : "application/octet-stream";
}

/** Explicit MIME stays authoritative; absent/generic metadata follows the file name. */
export function resolveMediaMime(name: string, mimeType?: string): string {
  const supplied = mimeType?.trim();
  return !supplied || supplied.split(";")[0]!.trim().toLowerCase() === "application/octet-stream"
    ? mediaMime(name) : supplied;
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
