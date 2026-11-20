import { useMemo, useRef, useState } from "react";
import { useHostClient, useHostQuery } from "@/state/queries";
import type { GitHistory, GitHistoryCommit } from "../../../../src/platform/tauri/fs";
import type { GitScope } from "./git-types";
import {
  GIT_HISTORY_MAX, GIT_HISTORY_PAGE, appendHistoryPage, gitHistoryRequest, historyReadSize,
  historySkipIgnored, validateGitHistoryResponse, type GitHistoryRead,
} from "./git-history-model";

export function useGitHistoryRead<T>(scope: GitScope, read: GitHistoryRead, enabled = true, keepPrevious = false) {
  return useHostQuery<T>(
    ["git-history", scope.projectId, scope.cwd, scope.root, read],
    "workspace.run",
    {},
    {
      enabled: !!scope.root && enabled,
      keepPrevious,
      queryFn: async (client, signal) => validateGitHistoryResponse(read,
        await client.request<unknown>("workspace.run", gitHistoryRequest(scope, read), { signal })) as T,
    },
  );
}

/** Pages read after the graph query's own read; valid only while `base` is the shown snapshot. */
type Tail = { base: GitHistory; commits: GitHistoryCommit[]; ended: boolean; loading: boolean; error: unknown };

/**
 * Commit list for one checkout. "Load more" on the graph reads only the next page (`skip`) of the
 * same walk and appends it, so loaded commits stay on screen and are never listed twice. A refresh
 * re-reads the depth already loaded in one request, so pages never mix two ref states. A Host that
 * ignores `skip` is read again with a longer limit instead. File history has no offset: it keeps the
 * shown commits while a longer prefix loads.
 */
export function useGitCommitPages(scope: GitScope, path?: string) {
  const client = useHostClient();
  const scopeKey = [scope.projectId, scope.cwd ?? "", scope.root ?? ""].join("\0");
  const [fileLimit, setFileLimit] = useState(GIT_HISTORY_PAGE);
  const [tail, setTail] = useState<Tail | null>(null);
  // Commits shown for the scope, so a refresh keeps the depth the owner scrolled to.
  const depth = useRef({ scopeKey, count: GIT_HISTORY_PAGE });
  // The depth a read answered with fewer commits than it asked for: no more history.
  const short = useRef<{ scopeKey: string; length: number } | null>(null);
  const fileQuery = useGitHistoryRead<GitHistoryCommit[]>(scope,
    { kind: "fileHistory", path: path ?? "", limit: fileLimit }, !!path, true);
  const graphQuery = useHostQuery<GitHistory>(
    ["git-history", scope.projectId, scope.cwd, scope.root, { kind: "history" }],
    "workspace.run",
    {},
    {
      enabled: !!scope.root && !path,
      queryFn: async (host, signal) => {
        const limit = historyReadSize(depth.current.scopeKey === scopeKey ? depth.current.count : 0);
        const read: GitHistoryRead = { kind: "history", limit };
        const history = validateGitHistoryResponse(read,
          await host.request<unknown>("workspace.run", gitHistoryRequest(scope, read), { signal })) as GitHistory;
        depth.current = { scopeKey, count: history.commits.length };
        short.current = history.commits.length < limit ? { scopeKey, length: history.commits.length } : null;
        return history;
      },
    },
  );
  const base = path ? undefined : graphQuery.data;
  const more = base && tail?.base === base ? tail : null;
  const commits = useMemo(() => {
    if (path) return fileQuery.data ?? [];
    if (!base) return [];
    return more?.commits.length ? base.commits.concat(more.commits) : base.commits;
  }, [path, fileQuery.data, base, more]);
  const capped = commits.length >= GIT_HISTORY_MAX;
  const ended = short.current?.scopeKey === scopeKey && short.current.length === base?.commits.length;
  const hasMore = !capped && (path
    ? fileQuery.isPlaceholderData || commits.length >= fileLimit
    : more ? !more.ended : !!base && base.commits.length >= GIT_HISTORY_PAGE && !ended);

  const loadMore = () => {
    if (path) {
      if (!fileQuery.isFetching) setFileLimit((current) => Math.min(GIT_HISTORY_MAX, current + GIT_HISTORY_PAGE));
      return;
    }
    if (!client || !base || more?.loading || !hasMore) return;
    const prior = more?.commits ?? [];
    const shown = base.commits.concat(prior);
    const read = async (request: GitHistoryRead) => (validateGitHistoryResponse(request,
      await client.request<unknown>("workspace.run", gitHistoryRequest(scope, request))) as GitHistory).commits;
    setTail({ base, commits: prior, ended: false, loading: true, error: null });
    const settle = (next: Partial<Tail>) => setTail((current) => current?.base === base ? { ...current, ...next } : current);
    void (async () => {
      let requested = Math.min(GIT_HISTORY_PAGE, GIT_HISTORY_MAX - shown.length);
      let page = await read({ kind: "history", limit: requested, skip: shown.length });
      if (historySkipIgnored(shown, page)) {
        requested = Math.min(GIT_HISTORY_MAX, shown.length + GIT_HISTORY_PAGE);
        page = await read({ kind: "history", limit: requested });
      }
      const next = appendHistoryPage(shown, page, requested);
      depth.current = { scopeKey, count: shown.length + next.fresh.length };
      settle({ commits: prior.concat(next.fresh), ended: next.ended, loading: false, error: null });
    })().catch((error: unknown) => settle({ loading: false, error }));
  };

  return {
    query: path ? fileQuery : graphQuery,
    commits,
    hasMore,
    capped,
    loadMore,
    loadingMore: path ? fileQuery.isPlaceholderData : !!more?.loading,
    moreError: path ? undefined : more?.error,
  };
}
