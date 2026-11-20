import { useQuery } from "@tanstack/react-query";
import type { RemoteInboxAvailability } from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine } from "@/state/machines";
import { hostKey, useHostClient, useHostQuery, useHostReadActive } from "@/state/queries";
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

/** Availability and credentials gate reads; cache identity remains the selected machine. */
export function useInboxRead<Action extends InboxReadAction>(
  request: InboxJobRequest<Action>,
  enabled = true,
) {
  const client = useHostClient();
  const active = useHostReadActive();
  const machine = useActiveMachine();
  return useQuery<InboxJobResults[Action]>({
    queryKey: hostKey(machine?.id ?? null, ["provider-inbox", request.action, request.input]),
    queryFn: ({ signal }) => {
      if (!client) throw new InboxJobError("Choose a computer first.");
      return runInboxJob<Action>(client, request, signal);
    },
    enabled: !!client && active && enabled,
    retry: false,
    staleTime: 20_000,
  });
}
