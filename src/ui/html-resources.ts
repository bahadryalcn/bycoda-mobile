import { mediaMime, resolveProjectPath, type MessageContext } from "./media-policy";

const MAX_RESOURCES = 12;
const MAX_BYTES = 2 * 1024 * 1024;
const CONCURRENCY = 3;
type ResourceRead = {
  command: string;
  path: string;
  remaining: number;
  value?: string;
  failed?: boolean;
  slot?: boolean;
  promise?: Promise<void>;
};

/** Fetch independently; apply replacements and the aggregate budget in source order. */
export async function bundleHtmlResources(
  html: string,
  name: string,
  context: MessageContext,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error("Preview cancelled.");
  const documentPath = resolveProjectPath(context.cwd, name);
  const base = documentPath?.slice(0, documentPath.lastIndexOf("/") + 1) ?? context.cwd + "/";
  let unavailable = 0;
  let used = 0;
  let length = html.length;
  const resources = Array.from(
    html.matchAll(
      /<(img|script|link)\b[^>]*?\b(src|href)\s*=\s*(["'])(.*?)\3[^>]*>(?:<\/script\s*>)?/gi,
    ),
  );
  const pending = new Map<string, ResourceRead>();
  const jobs: ResourceRead[] = [];
  const selected = resources.map((match) => {
    const url = match[4]!;
    if (/^(?:data:|blob:|#)/i.test(url)) return null;
    if (signal?.aborted) throw new Error("Preview cancelled.");
    if (used++ >= MAX_RESOURCES || /^(?:https?:)?\/\//i.test(url) || /^[a-z][\w+.-]*:/i.test(url)) {
      unavailable++;
      return null;
    }
    const path = resolveProjectPath(context.cwd, base + url);
    if (!path) {
      unavailable++;
      return null;
    }
    const tag = match[1]!.toLowerCase();
    if (tag === "link" && !/rel\s*=\s*["']stylesheet["']/i.test(match[0])) return null;
    const command = tag === "img" ? "read_binary_file" : "read_text_file";
    const key = command + ":" + path;
    if (!pending.has(key)) {
      const result: ResourceRead = { command, path, remaining: 0 };
      pending.set(key, result);
      jobs.push(result);
    }
    const result = pending.get(key)!;
    result.remaining++;
    return { match, tag, url, path, result };
  });
  let next = 0;
  let outstanding = 0;
  let finished = false;
  const fillLookahead = () => {
    while (
      outstanding < CONCURRENCY &&
      next < jobs.length &&
      length < MAX_BYTES &&
      !signal?.aborted
    ) {
      const result = jobs[next++]!;
      result.slot = true;
      outstanding++;
      result.promise = (async () => {
        try {
          const value = await context.client.request<string>(
            "workspace.run",
            { command: result.command, args: { path: result.path } },
            { signal },
          );
          if (finished || signal?.aborted) return;
          // The committed budget only shrinks, so a result that cannot fit now
          // cannot become usable at a later occurrence of the same path.
          if (typeof value === "string" && length + value.length <= MAX_BYTES) result.value = value;
          else result.failed = true;
        } catch {
          result.failed = true;
        }
      })();
    }
  };
  const replacements: { from: number; to: number; html: string }[] = [];
  try {
    for (const resource of selected) {
      if (!resource) continue;
      if (signal?.aborted) throw new Error("Preview cancelled.");
      fillLookahead();
      const { match, tag, url, path, result } = resource;
      if (!result.promise) {
        unavailable++;
        result.remaining--;
        continue;
      }
      await result.promise;
      if (signal?.aborted) throw new Error("Preview cancelled.");
      // Settled later reads retain their slots until the source-order consumer
      // reaches them. Completion alone must never drain the rest of the queue.
      if (result.slot) {
        outstanding--;
        result.slot = false;
      }
      let accepted = false;
      try {
        const value = result.value;
        if (result.failed || value === undefined || length + value.length > MAX_BYTES) {
          unavailable++;
          continue;
        }
        let replacement: string;
        if (tag === "img") {
          const mime = mediaMime(path);
          if (!mime.startsWith("image/") || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
            unavailable++;
            continue;
          }
          replacement = match[0].replace(
            match[3] + url + match[3],
            () => '"data:' + mime + ";base64," + value + '"',
          );
        } else if (tag === "script")
          replacement = "<script>" + value.replace(/<\/script/gi, "<\\/script") + "</script>";
        else {
          replacement = "<style>" + value + "</style>";
          if (/url\s*\((?!\s*["']?data:)/i.test(value)) unavailable++;
        }
        replacements.push({
          from: match.index!,
          to: match.index! + match[0].length,
          html: replacement,
        });
        length += value.length;
        accepted = true;
      } finally {
        result.remaining--;
        if (
          !accepted ||
          !result.remaining ||
          (result.value !== undefined && length + result.value.length > MAX_BYTES)
        ) {
          result.value = undefined;
          if (!accepted) result.failed = true;
        }
      }
    }
  } finally {
    finished = true;
    for (const result of jobs) result.value = undefined;
  }
  let bundled = html;
  // Original offsets cannot accidentally replace another tag within an inlined script.
  for (const replacement of replacements.reverse())
    bundled = bundled.slice(0, replacement.from) + replacement.html + bundled.slice(replacement.to);
  return { html: bundled, unavailable };
}
