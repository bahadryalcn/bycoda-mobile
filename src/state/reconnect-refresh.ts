import type { Query, QueryClient } from "@tanstack/react-query";
import { isProjectPrivacyQuery } from "../features/workspace/project-privacy-cache";

/** Quiet period after the last `ready`: a flapping link restarts it instead of refetching each time. */
export const RECONNECT_DEBOUNCE_MS = 500;
/** Reads started per wave: far below the socket's in-flight limit (48) and the Host's pending limit (64). */
export const RECONNECT_WAVE_SIZE = 4;
/** Gap between waves, plus random jitter so phones do not hit a restarted Host in lockstep. */
export const RECONNECT_WAVE_GAP_MS = 250;
export const RECONNECT_WAVE_JITTER_MS = 250;

export type ReconnectRefreshOptions = {
  /** Foreground, unlocked and consented: reads must not start for a hidden or locked app. */
  canRun: () => boolean;
  random?: () => number;
};

type Plan = { timer: ReturnType<typeof setTimeout> | undefined };

/** Failed or empty reads are what the user sees broken, so they go first; then the oldest data. */
function refreshOrder(a: Query, b: Query) {
  const weight = (query: Query) =>
    query.state.status === "error" || query.state.data === undefined ? 0 : 1;
  return weight(a) - weight(b) || a.state.dataUpdatedAt - b.state.dataUpdatedAt;
}

/**
 * Reads still worth refreshing at this moment. Rechecked before every wave because the user may have
 * left the screen, locked the app or refreshed the query by hand while earlier waves were running.
 */
function needsRefresh(query: Query) {
  if (!query.isActive() || query.state.fetchStatus === "fetching") return false;
  // A live stream owns this read: it reopens on `ready` and delivers its own snapshot, so a
  // refetch would download the same data twice. A failed or empty read still refreshes.
  if (query.meta?.streamOwned === true && query.state.status === "success") return false;
  return query.state.status === "error" || query.isStale();
}

/**
 * After a socket reaches `ready`, the data of that computer may have changed while the link was down.
 * Refreshing every query at once would burst past the socket queue and the Host's pending-RPC limit, so
 * this debounces per computer, skips reads still fresh within their `staleTime`, marks screens that are
 * not in front stale for their next visit, and refetches the visible screen's reads in small jittered
 * waves, broken or empty ones first. Project-privacy proof is never refetched here (it has its own
 * owner), an in-flight read is never cancelled, and nothing starts while `canRun` is false.
 */
export function createReconnectRefresh(cache: QueryClient, options: ReconnectRefreshOptions) {
  const random = options.random ?? Math.random;
  const plans = new Map<string, Plan>();

  const stop = (machineId: string) => {
    const plan = plans.get(machineId);
    if (!plan) return;
    if (plan.timer !== undefined) clearTimeout(plan.timer);
    plans.delete(machineId);
  };

  const runWave = (machineId: string, plan: Plan, queue: Query[]) => {
    plan.timer = undefined;
    if (plans.get(machineId) !== plan) return;
    if (!options.canRun()) {
      stop(machineId);
      return;
    }
    let started = 0;
    while (queue.length && started < RECONNECT_WAVE_SIZE) {
      const query = queue.shift()!;
      if (!needsRefresh(query)) continue;
      started++;
      // cancelRefetch:false keeps a read the user (or a screen) started itself instead of restarting it.
      void cache
        .refetchQueries({ queryKey: query.queryKey, exact: true, type: "active" }, { cancelRefetch: false })
        .catch(() => undefined);
    }
    if (!queue.length) {
      stop(machineId);
      return;
    }
    plan.timer = setTimeout(
      () => runWave(machineId, plan, queue),
      RECONNECT_WAVE_GAP_MS + Math.floor(random() * RECONNECT_WAVE_JITTER_MS),
    );
  };

  const start = (machineId: string, plan: Plan) => {
    plan.timer = undefined;
    if (plans.get(machineId) !== plan) return;
    if (!options.canRun()) {
      stop(machineId);
      return;
    }
    const queue: Query[] = [];
    const queries = cache.getQueryCache().findAll({
      queryKey: ["machine", machineId],
      predicate: ({ queryKey }) => !isProjectPrivacyQuery(queryKey),
    });
    for (const query of queries) {
      // Screens behind the front one stay mounted but disabled: they refetch on their next visit.
      if (!query.isActive()) query.invalidate();
      else if (needsRefresh(query)) queue.push(query);
    }
    queue.sort(refreshOrder);
    runWave(machineId, plan, queue);
  };

  return {
    /** The runtime reached `ready`. Repeated calls inside the quiet period collapse into one refresh. */
    schedule(machineId: string) {
      stop(machineId);
      const plan: Plan = { timer: undefined };
      plans.set(machineId, plan);
      plan.timer = setTimeout(() => start(machineId, plan), RECONNECT_DEBOUNCE_MS);
    },
    /** The link dropped again or the computer went away: pending and queued refreshes are dropped. */
    cancel: stop,
    dispose() {
      for (const machineId of [...plans.keys()]) stop(machineId);
    },
  };
}
