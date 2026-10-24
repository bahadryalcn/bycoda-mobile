import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { readEarlier, readSession, resolveSync } from "./wire";
import type { HostSession } from "./wire";
import type { SessionBlockRequest, SessionScope } from "./session-types";
import type { SessionSyncResponse } from "../../../../src/features/connections/model/protocol";
import { RemoteHostError } from "@/remote/host-error";
import { sessionReadSchedule, unsupportedSessionWait } from "./session-read-schedule";

export function useSessionSnapshot(scope: SessionScope, options: { enabled?: boolean; projectId?: string; canRead?: () => boolean } = {}) {
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const key = useMemo(
    () => hostKey(scope.machineId, ["session", scope.sessionId]),
    [scope.machineId, scope.sessionId],
  );
  const identity = [scope.machineId, client?.machine.environmentId, client?.endpoint].join("\0");
  const enabled = !!client && active && options.enabled !== false && !!options.projectId;
  useEffect(() => {
    const cancelInactive = () => queueMicrotask(() => {
      const query = cache.getQueryCache().find({ queryKey: key, exact: true });
      if (query && !query.isActive()) void cache.cancelQueries({ queryKey: key, exact: true });
    });
    if (!enabled) cancelInactive();
    return cancelInactive;
  }, [cache, key, enabled]);

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      if (!client || !options.projectId || options.canRead?.() === false) throw new Error("The session project is unavailable.");
      let value: HostSession;
      const schedule = sessionReadSchedule(cache.getQueryCache().find({ queryKey: key, exact: true }), identity);
      const known = cache.getQueryData<HostSession>(key);
      const waitMs = schedule.waitMs(known);
      const started = Date.now();
      try {
        try { value = await readSession(client, scope.sessionId, known, { signal, waitMs }); }
        catch (error) {
          if (!waitMs || !unsupportedSessionWait(error)) throw error;
          schedule.rejectWait();
          value = await readSession(client, scope.sessionId, known, { signal });
        }
      }
      catch (error) { if (error instanceof Error && /Transcript identity changed/.test(error.message)) throw new RemoteHostError(scope.machineId, "identity", "Transcript identity changed."); throw error; }
      if (options.canRead?.() === false || value.projectId !== options.projectId || value.session.id !== scope.sessionId)
        throw new RemoteHostError(scope.machineId, "identity", "Transcript project identity changed.");
      schedule.observe(known, value, Date.now() - started, waitMs);
      return value;
    },
    enabled,
    staleTime: 1_000,
    refetchInterval: (query) => {
      if (!enabled || query.state.fetchStatus === "fetching") return false;
      const kind = (query.state.error as { kind?: string } | null)?.kind;
      if (kind === "auth" || kind === "identity" || kind === "unsupported") return false;
      return sessionReadSchedule(query, identity).delay(query.state.data?.status === "running", !!query.state.error);
    },
  });
  const denied = ["auth", "identity"].includes((query.error as { kind?: string } | null)?.kind ?? "");
  return denied ? { ...query, data: undefined } : query;
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
      if (sync.value.session.id !== scope.sessionId) {
        throw new RemoteHostError(scope.machineId, "identity", "Transcript identity changed.");
      }
      const block = sync.value.session.blocks.find((value) => value.id === blockId);
      if (!block) throw new Error("Transcript block not found.");
      return block;
    },
  });
}
