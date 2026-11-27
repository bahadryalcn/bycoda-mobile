import { useQuery } from "@tanstack/react-query";
import type { RemoteInboxAvailability } from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine } from "@/state/machines";
import { hostKey, useHostClient, useHostQuery, useHostReadActive } from "@/state/queries";
import { retryTransientRead, transientRetryDelay } from "@/state/query-retry";
import { InboxJobError, runInboxJob } from "./provider-jobs";
import type { InboxJobRequest, InboxJobResults, InboxReadAction } from "./provider-protocol";

/**
 * Shared by every inbox and pull-request screen (one cache entry per computer). Refreshes on mount,
 * focus and foreground through the query lifecycle, after provider writes (which invalidate the
 * `provider-inbox` prefix) and on pull-to-refresh. The timed fallback runs once a minute.
 */
export function useProviderInboxAvailability() {
  return useHostQuery<RemoteInboxAvailability>(
    ["provider-inbox", "availability"],
    "inbox.provider.status",
    {},
    { interval: 60_000 },
  );
}

/** An opened record's reads (details, thread, checks) stay cached this long, so reopening it shows
 * the last result at once while it refreshes; each read is a desktop round trip of seconds. */
export const INBOX_RECORD_CACHE_MS = 30 * 60_000;

/** Availability and credentials gate reads; cache identity remains the selected machine. */
export function useInboxRead<Action extends InboxReadAction>(
  request: InboxJobRequest<Action>,
  enabled = true,
  options: {
    /**
     * Keep showing the previous read's result while this one loads, when the previous input
     * (same computer only) is an equivalent view of the same scope, e.g. only its sort differs.
     */
    keepPrevious?: (previousInput: InboxJobRequest<Action>["input"]) => boolean;
    /** How long an unwatched result stays cached; a desktop provider round trip takes seconds. */
    gcTime?: number;
    /**
     * Set by an explicit refresh before `refetch()`: that one list read asks every provider again
     * instead of accepting the desktop's recent list (any other read answers from it).
     */
    refreshNext?: { current: boolean };
  } = {},
) {
  const client = useHostClient();
  const active = useHostReadActive();
  const machine = useActiveMachine();
  const machineId = machine?.id ?? null;
  const { keepPrevious } = options;
  return useQuery<InboxJobResults[Action]>({
    queryKey: hostKey(machineId, ["provider-inbox", request.action, request.input]),
    // Another computer's or another action's data is never carried over as a placeholder.
    placeholderData: keepPrevious
      ? (previous, previousQuery) => {
          const key = previousQuery?.queryKey;
          return key && key[1] === machineId && key[3] === request.action &&
            keepPrevious(key[4] as InboxJobRequest<Action>["input"]) ? previous : undefined;
        }
      : undefined,
    ...(options.gcTime === undefined ? {} : { gcTime: options.gcTime }),
    queryFn: ({ signal }) => {
      if (!client) throw new InboxJobError("Choose a computer first.");
      const refresh = options.refreshNext?.current === true && request.action === "list";
      if (options.refreshNext) options.refreshNext.current = false;
      if (refresh) {
        const input = request.input as InboxJobRequest<"list">["input"];
        return runInboxJob<Action>(client, { ...request, input: { ...input, query: { ...input.query, refresh: true } } } as InboxJobRequest<Action>, signal);
      }
      return runInboxJob<Action>(client, request, signal);
    },
    enabled: !!client && active && enabled,
    // A read only asks the desktop again with a fresh request ID; a dropped link (an app resume
    // while the socket reconnects) retries quietly like every other Host read.
    retry: retryTransientRead,
    retryDelay: transientRetryDelay,
    staleTime: 20_000,
  });
}
