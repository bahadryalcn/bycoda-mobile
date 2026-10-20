import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { readEarlier, readSession, resolveSync } from "./wire";
import type { HostSession } from "./wire";
import type { SessionBlockRequest, SessionScope } from "./session-types";
import type { SessionSyncResponse } from "../../../../src/features/connections/model/protocol";

export function useSessionSnapshot(scope: SessionScope) {
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const key = useMemo(
    () => hostKey(scope.machineId, ["session", scope.sessionId]),
    [scope.machineId, scope.sessionId],
  );

  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      readSession(client!, scope.sessionId, cache.getQueryData<HostSession>(key), { signal }),
    enabled: !!client && active,
    staleTime: 1_000,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2_500 : 7_500),
  });
}

export function useEarlierSession(scope: SessionScope, session?: HostSession) {
  const client = useHostClient();
  const cache = useQueryClient();
  const key = hostKey(scope.machineId, ["session", scope.sessionId]);

  return useMutation({
    mutationFn: async () => {
      if (!client || !session) return;
      const loaded = await readEarlier(client, session);
      // A poll can advance during paging. Never replace its newer revision.
      cache.setQueryData<HostSession>(key, (current) =>
        current?.revision === loaded.revision ? loaded : current,
      );
    },
  });
}

export function useSessionBlock({ scope, blockId, revision, enabled }: SessionBlockRequest) {
  const client = useHostClient();
  const active = useHostReadActive();

  return useQuery({
    queryKey: hostKey(scope.machineId, ["session-block", scope.sessionId, blockId, revision]),
    enabled: !!client && active && enabled,
    queryFn: async ({ signal }) => {
      const response = await client!.request<SessionSyncResponse>(
        "sessions.block",
        { sessionId: scope.sessionId, blockId, revision },
        { signal },
      );
      const sync = await resolveSync(client!, scope.sessionId, response, { signal });
      if (sync.kind !== "snapshot") {
        throw new Error("Transcript block response changed.");
      }
      const block = sync.value.session.blocks.find((value) => value.id === blockId);
      if (!block) throw new Error("Transcript block not found.");
      return block;
    },
  });
}
