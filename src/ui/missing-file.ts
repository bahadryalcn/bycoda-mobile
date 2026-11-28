import type { HostFileEntry } from "@/remote/types";
import type { MessageContext } from "./media-policy";

/** A file reference that names no file on the computer: retrying the same read cannot help. */
export class MissingFileError extends Error {
  constructor() {
    super("This file was not found on the computer. It may have been moved or deleted.");
    this.name = "MissingFileError";
  }
}

type FileStat = { path: string; mtimeMs: number | null; isDir?: boolean };

const comparable = (path: string, windows: boolean) => {
  const value = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return windows ? value.toLowerCase() : value;
};

/**
 * Where a failed file read should look next, like desktop's message file references: a file that
 * exists where it points keeps its original failure (`undefined`); a missing one is looked up by its
 * project-relative tail in the project's file index. One match is returned as its absolute path;
 * none or several means the reference cannot be resolved (`null`).
 */
export async function relocateMissingFile(
  context: Pick<MessageContext, "client" | "projectId" | "cwd">,
  resolved: string,
  signal?: AbortSignal,
): Promise<string | null | undefined> {
  const stats = await context.client.request<FileStat[]>("workspace.run", { command: "stat_files", args: { paths: [resolved] } }, { signal });
  const stat = Array.isArray(stats) ? stats[0] : undefined;
  // Unknown metadata never turns a real read failure into "not found".
  if (!stat || typeof stat !== "object") return undefined;
  if (stat.mtimeMs != null || stat.isDir) return undefined;
  const root = context.cwd.replace(/\\/g, "/").replace(/\/$/, "");
  const windows = /^[a-z]:/i.test(root);
  const absolute = resolved.replace(/\\/g, "/");
  if (!comparable(absolute, windows).startsWith(comparable(root, windows) + "/")) return null;
  const tail = absolute.slice(root.length + 1);
  const name = tail.split("/").pop();
  if (!name || name.length > 200) return null;
  const entries = await context.client.request<HostFileEntry[]>("files.search", { projectId: context.projectId, cwd: context.cwd, query: name }, { signal });
  if (!Array.isArray(entries)) return null;
  const wanted = comparable(tail, windows);
  const matches = entries.filter((entry) => {
    if (!entry || entry.isDir || typeof entry.path !== "string") return false;
    const path = comparable(entry.path, windows);
    return path !== wanted && (path.endsWith("/" + wanted) || wanted.endsWith("/" + path) || path.split("/").pop() === wanted);
  });
  return matches.length === 1 ? `${root}/${matches[0]!.path.replace(/\\/g, "/").replace(/^\.\//, "")}` : null;
}
