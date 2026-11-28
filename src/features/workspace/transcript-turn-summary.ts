import type { Block } from "./wire";

/** One page a provider's web search returned (desktop `SearchSource`). */
export type TurnSource = { title: string; url: string; domain: string };

/** A file the turn changed, its edits summed in first-edit order (desktop `TurnChangedFile`). */
export type TurnChangedFile = {
  /** Path identity: separators normalized, case folded for Windows drive paths. */
  key: string;
  path: string;
  status?: "added" | "deleted" | "modified";
  counts?: { additions: number; deletions: number };
  /** The tool records that changed it, oldest first, so a tap opens exactly those edits. */
  blockIds: string[];
};

/** What a settled turn produced beyond its text: desktop's changed-files strip and folded sources. */
export type TurnSummary = { files: TurnChangedFile[]; sources: TurnSource[] };

type FileChange = NonNullable<NonNullable<Block["tool"]>["fileChanges"]>[number];

const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
const pathKey = (path: string) => {
  const value = normalize(path);
  return /^[a-z]:\//i.test(value) ? value.toLowerCase() : value;
};

/**
 * Port of desktop `turnChangedFiles` (src/features/sessions/model/turnChangedFiles.ts); the desktop
 * module pulls platform path code. Completed, not denied, tool records only. Providers that report no
 * `fileChanges` fall back to a write preview's path and counts, the data mobile actually receives.
 */
function blockFileChanges(block: Block): FileChange[] {
  const tool = block.tool;
  if (tool?.fileChanges) return tool.fileChanges;
  const preview = tool?.preview;
  if (preview?.kind !== "write" || !preview.path) return [];
  const { path, additions, deletions, lines, contentOnly } = preview;
  if (contentOnly || (additions == null && deletions == null && !lines?.length)) return [{ path }];
  return [{
    path,
    counts: {
      additions: additions ?? lines?.filter((line) => line.kind === "add").length ?? 0,
      deletions: deletions ?? lines?.filter((line) => line.kind === "del").length ?? 0,
    },
  }];
}

export function turnChangedFiles(turn: readonly Block[]): TurnChangedFile[] {
  const files = new Map<string, TurnChangedFile>();
  for (const block of turn) {
    const status = block.tool?.status?.toLowerCase();
    if (block.role !== "tool" || block.approval?.decided === "deny" || (status !== "completed" && status !== "success"))
      continue;
    for (const change of blockFileChanges(block)) {
      if (!change.path?.trim()) continue;
      const key = pathKey(change.path);
      const previous = files.get(key);
      if (!previous) {
        files.set(key, {
          key,
          path: change.path,
          ...(change.status ? { status: change.status } : {}),
          ...(change.counts ? { counts: { ...change.counts } } : {}),
          blockIds: [block.id],
        });
        continue;
      }
      if (!previous.blockIds.includes(block.id)) previous.blockIds.push(block.id);
      // A file added earlier in the turn stays added when edited again.
      if (change.status && !(previous.status === "added" && change.status === "modified")) previous.status = change.status;
      // Like desktop, one edit without counts makes the file's total unknown.
      previous.counts = previous.counts && change.counts
        ? { additions: previous.counts.additions + change.counts.additions, deletions: previous.counts.deletions + change.counts.deletions }
        : undefined;
      if (!previous.counts) delete previous.counts;
    }
  }
  return [...files.values()];
}

const webUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** Port of desktop `collectSearchSources`: the turn's pages in search order, one per URL, http(s) only. */
export function turnSearchSources(turn: readonly Block[]): TurnSource[] {
  const seen = new Set<string>();
  const out: TurnSource[] = [];
  for (const block of turn) {
    const preview = block.tool?.preview;
    if (preview?.kind !== "search" || !preview.sources) continue;
    for (const source of preview.sources) {
      if (!source?.url || seen.has(source.url) || !webUrl(source.url)) continue;
      seen.add(source.url);
      out.push({ title: source.title?.trim() || source.domain || source.url, url: source.url, domain: source.domain || source.url });
    }
  }
  return out;
}

export function turnSummary(turn: readonly Block[]): TurnSummary | undefined {
  const files = turnChangedFiles(turn);
  const sources = turnSearchSources(turn);
  return files.length || sources.length ? { files, sources } : undefined;
}

/** Structural equality, so a regrouped settled turn keeps its row's identity. */
export function sameTurnSummary(a: TurnSummary | undefined, b: TurnSummary | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Workspace-relative display path; outside paths stay absolute. */
export function displayChangedPath(path: string, cwd?: string) {
  const value = normalize(path);
  if (!cwd) return value;
  const root = normalize(cwd);
  const folded = /^[a-z]:\//i.test(root);
  const inside = (folded ? value.toLowerCase() : value).startsWith(`${folded ? root.toLowerCase() : root}/`);
  return inside ? value.slice(root.length + 1) : value;
}

/** File name and its parent folder, for a row that leads with the name. */
export function splitChangedPath(path: string): { name: string; folder?: string } {
  const value = normalize(path);
  const slash = value.lastIndexOf("/");
  if (slash < 0) return { name: value };
  return { name: value.slice(slash + 1) || value, ...(slash > 0 ? { folder: value.slice(0, slash) } : {}) };
}

/** Rows shown before "Show N more"; desktop shows six too. */
export const COLLAPSED_SUMMARY_ROWS = 6;
