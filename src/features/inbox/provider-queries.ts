import { useQuery } from "@tanstack/react-query";
import type { RemoteInboxAvailability } from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine } from "@/state/machines";
import { hostKey, useHostClient, useHostQuery } from "@/state/queries";
import { InboxJobError, runInboxJob } from "./provider-jobs";
import type { InboxJobRequest, InboxJobResults, InboxReadAction } from "./provider-protocol";

export function useProviderInboxAvailability() {
  return useHostQuery<RemoteInboxAvailability>(
    ["provider-inbox", "availability"],
    "inbox.provider.status",
    {},
    { interval: 5_000 },
  );
}

/** Availability and credentials gate reads; cache identity remains the selected machine. */
export function useInboxRead<Action extends InboxReadAction>(
  request: InboxJobRequest<Action>,
  enabled = true,
) {
  const client = useHostClient();
  const machine = useActiveMachine();
  return useQuery<InboxJobResults[Action]>({
    queryKey: hostKey(machine?.id ?? null, ["provider-inbox", request.action, request.input]),
    queryFn: ({ signal }) => {
      if (!client) throw new InboxJobError("Choose a computer first.");
      return runInboxJob<Action>(client, request, signal);
    },
    enabled: !!client && enabled,
    retry: false,
    staleTime: 20_000,
  });
}
