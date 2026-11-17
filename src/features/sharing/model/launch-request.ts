import { create } from "zustand";

/** A file another app shared; the composer copies it into its own staging folder. */
export type LaunchFile = { uri: string; name: string; mimeType?: string };

/** Content waiting for the next new session: from a prompt link or the system share sheet. */
export type LaunchRequest = { text: string; project?: string; files: LaunchFile[] };

/** The draft-append queue keeps eight requests: one for the text and seven files. */
export const LAUNCH_FILE_LIMIT = 7;
const TEXT_LIMIT = 64_000;
const PROMPT_LIMIT = 8000;
const PROJECT_LIMIT = 256;

/** Route params are bounded again here because any in-app link can reach the screen. */
export function launchFromParams(params: { prompt?: unknown; project?: unknown }): LaunchRequest | null {
  const { prompt, project } = params;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > PROMPT_LIMIT) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(prompt)) return null;
  const key = typeof project === "string" && project.length <= PROJECT_LIMIT ? project : undefined;
  return { text: prompt, ...(key ? { project: key } : {}), files: [] };
}

function uriName(uri: string): string {
  const last = uri.split("?")[0].split("/").pop() ?? "";
  try {
    return decodeURIComponent(last) || "attachment";
  } catch {
    return last || "attachment";
  }
}

type SharedFile = {
  path?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

/** Text, link and file shares become one request; an empty share yields nothing. */
export function launchFromShare(share: {
  text?: string | null;
  webUrl?: string | null;
  files?: readonly SharedFile[] | null;
}): LaunchRequest | null {
  let text = (share.text ?? "").trim();
  const url = (share.webUrl ?? "").trim();
  if (url && !text.includes(url)) text = text ? `${text}\n\n${url}` : url;
  const files: LaunchFile[] = [];
  for (const file of share.files ?? []) {
    const uri = file.path?.trim();
    if (!uri || !/^(file|content):/.test(uri) || files.length >= LAUNCH_FILE_LIMIT) continue;
    const name = file.fileName?.trim() || uriName(uri);
    files.push({ uri, name: name.slice(0, 255), ...(file.mimeType ? { mimeType: file.mimeType } : {}) });
  }
  text = text.slice(0, TEXT_LIMIT);
  return text || files.length ? { text, files } : null;
}

/** A newer request never replaces what the owner has not used yet; the content is kept. */
export function mergeLaunch(current: LaunchRequest | null, next: LaunchRequest): LaunchRequest {
  if (!current) return next;
  const text =
    !next.text || current.text.includes(next.text)
      ? current.text
      : current.text
        ? `${current.text}\n\n${next.text}`
        : next.text;
  const files = [...current.files];
  for (const file of next.files)
    if (files.length < LAUNCH_FILE_LIMIT && !files.some((known) => known.uri === file.uri)) files.push(file);
  return { text: text.slice(0, TEXT_LIMIT), project: next.project ?? current.project, files };
}

/** The project a link names: its id, else a unique case-insensitive name. */
export function matchLaunchProject<T extends { id: string; name: string }>(
  projects: readonly T[],
  key: string | undefined,
): T | undefined {
  if (!key) return undefined;
  const byId = projects.find((project) => project.id === key);
  if (byId) return byId;
  const named = projects.filter((project) => project.name.toLowerCase() === key.toLowerCase());
  return named.length === 1 ? named[0] : undefined;
}

type LaunchState = {
  request: LaunchRequest | null;
  queue: (request: LaunchRequest) => void;
  /** Returns what is waiting and empties the queue. */
  take: () => LaunchRequest | null;
  clear: () => void;
};

export const useLaunchRequest = create<LaunchState>((set, get) => ({
  request: null,
  queue: (request) => set({ request: mergeLaunch(get().request, request) }),
  take: () => {
    const request = get().request;
    if (request) set({ request: null });
    return request;
  },
  clear: () => set({ request: null }),
}));
