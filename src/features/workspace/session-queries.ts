import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { readEarlier, readSession, resolveSync } from "./wire";
import type { HostSession } from "./wire";
import type { SessionBlockRequest, SessionScope } from "./session-types";
import type { SessionSyncResponse } from "../../../../src/features/connections/model/protocol";
import { RemoteHostError } from "@/remote/host-error";
import { sessionReadSchedule, unsupportedSessionWait } from "./session-read-schedule";
import { pruneInactiveSessionCache } from "./session-cache";
import { retainSessionAuthority } from "@/domain/session-authority";
import { watchSessionStream } from "@/remote/session-sync";
import { isTransientConnectionError } from "@/state/query-retry";
import type { MobileStreamSubscription } from "@/remote/host-transport";
import { SessionProjectMismatch } from "@/remote/session-project";

export function useSessionSnapshot(
  scope: SessionScope,
  options: {
    enabled?: boolean;
    projectId?: string;
    canRead?: () => boolean;
    restoreBefore?: () => number | undefined;
  } = {},
) {
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  const key = useMemo(
    () => hostKey(scope.machineId, ["session", scope.sessionId]),
    [scope.machineId, scope.sessionId],
  );
  const identity = [scope.machineId, client?.machine.environmentId, client?.endpoint].join("\0");
  const enabled = !!client && active && options.enabled !== false && !!options.projectId;
  const streaming = enabled && (client?.supportsStreams?.() ?? false);
  const liveOptions = useRef(options);
  liveOptions.current = options;
  const liveIdentity = useRef({
    enabled,
    machineId: scope.machineId,
    sessionId: scope.sessionId,
    projectId: options.projectId,
  });
  liveIdentity.current = {
    enabled,
    machineId: scope.machineId,
    sessionId: scope.sessionId,
    projectId: options.projectId,
  };
  // A stream error belongs to the query data it was raised against; newer data supersedes it.
  const [streamFailure, setStreamError] = useState<{ error: Error; at: number } | undefined>();
  const dataStamp = useRef(0);
  // While the stream is failing the normal snapshot poll takes over.
  const streamFailing = useRef(false);
  const observedKey = useMemo(
    () => (active ? key : hostKey(scope.machineId, ["parked-session", scope.sessionId])),
    [active, key, scope.machineId, scope.sessionId],
  );
  useEffect(() => {
    const cancelInactive = () =>
      queueMicrotask(() => {
        const query = cache.getQueryCache().find({ queryKey: key, exact: true });
        if (query && !query.isActive())
          void cache
            .cancelQueries({ queryKey: key, exact: true })
            .then(() => pruneInactiveSessionCache(cache));
      });
    if (!enabled) cancelInactive();
    return cancelInactive;
  }, [cache, key, enabled]);
  useEffect(() => {
    if (!streaming || !client || !options.projectId) {
      streamFailing.current = false;
      setStreamError(undefined);
      return;
    }
    let disposed = false,
      subscription: MobileStreamSubscription | undefined;
    const controller = new AbortController();
    const current = () => {
      client.assertCurrentAccess();
      const currentIdentity = liveIdentity.current;
      if (
        disposed ||
        controller.signal.aborted ||
        !currentIdentity.enabled ||
        currentIdentity.machineId !== scope.machineId ||
        currentIdentity.sessionId !== scope.sessionId ||
        currentIdentity.projectId !== options.projectId ||
        liveOptions.current.canRead?.() === false
      )
        throw new RemoteHostError(scope.machineId, "auth", "The session project is unavailable.");
    };
    void watchSessionStream(client, {
      sessionId: scope.sessionId,
      projectId: options.projectId,
      known: () => cache.getQueryData<HostSession | null>(key) ?? undefined,
      apply: async (snapshot, assertCurrent) => {
        current();
        assertCurrent();
        let value = snapshot;
        const wanted =
          liveOptions.current.restoreBefore?.() ??
          cache.getQueryData<HostSession>(key)?.history?.before;
        while (
          wanted !== undefined &&
          value.history?.before !== undefined &&
          value.history.before > wanted
        ) {
          current();
          assertCurrent();
          const before = value.history.before;
          value = await readEarlier(client, value, { signal: controller.signal });
          if (value.history?.before !== undefined && value.history.before >= before)
            throw new Error("Transcript restore cursor did not advance.");
        }
        current();
        assertCurrent();
        await cache.cancelQueries({ queryKey: key, exact: true }, { silent: true, revert: false });
        current();
        assertCurrent();
        cache.setQueryData<HostSession>(key, (previous) =>
          previous && previous.revision > value.revision
            ? previous
            : retainSessionAuthority(previous, value),
        );
        streamFailing.current = false;
        setStreamError(undefined);
      },
      onError: (error) => {
        if (disposed) return;
        // A removed or revoked session must not stay readable from the cache: drop its
        // transcript and block copies. Drafts and held sends live in their own owners.
        const failed = error as { kind?: string; category?: string };
        if (failed.kind === "identity" || failed.category === "identity")
          void cache.cancelQueries({ queryKey: key, exact: true }).then(() => {
            cache.removeQueries({ queryKey: key, exact: true });
            cache.removeQueries({ queryKey: hostKey(scope.machineId, ["session-block", scope.sessionId]) });
          }).catch(() => undefined);
        streamFailing.current = true;
        setStreamError({ error, at: dataStamp.current });
      },
    })
      .then((value) => {
        if (disposed) value.close();
        else subscription = value;
      })
      .catch((error) => {
        if (!disposed) streamFailing.current = true;
        if (!disposed)
          setStreamError({
            error:
              error instanceof Error ? error : new Error("The Host stream could not be opened."),
            at: dataStamp.current,
          });
      });
    return () => {
      disposed = true;
      controller.abort();
      subscription?.close();
    };
  }, [streaming, client, cache, key, scope.machineId, scope.sessionId, options.projectId]);

  const query = useQuery<HostSession | null>({
    queryKey: observedKey,
    // A defined, payload-free value also releases QueryObserver's retained
    // previous-data reference when the old full query is evicted.
    initialData: active ? undefined : null,
    queryFn: async ({ signal }) => {
      if (!client || !options.projectId || options.canRead?.() === false)
        throw new Error("The session project is unavailable.");
      let value: HostSession;
      const schedule = sessionReadSchedule(
        cache.getQueryCache().find({ queryKey: key, exact: true }),
        identity,
      );
      const known = cache.getQueryData<HostSession>(key);
      const waitMs = streaming ? 0 : schedule.waitMs(known);
      const started = Date.now();
      try {
        try {
          value = await readSession(client, scope.sessionId, known, { signal, waitMs });
        } catch (error) {
          if (!waitMs || !unsupportedSessionWait(error)) throw error;
          schedule.rejectWait();
          value = await readSession(client, scope.sessionId, known, { signal });
        }
      } catch (error) {
        if (error instanceof Error && /Transcript identity changed/.test(error.message))
          throw new RemoteHostError(scope.machineId, "identity", "Transcript identity changed.");
        throw error;
      }
      if (options.canRead?.() === false || value.session.id !== scope.sessionId)
        throw new RemoteHostError(
          scope.machineId,
          "identity",
          "Transcript project identity changed.",
        );
      if (value.projectId !== options.projectId)
        throw new SessionProjectMismatch(scope.sessionId, options.projectId, value.projectId);
      schedule.observe(known, value, Date.now() - started, waitMs);
      const restoreBefore = options.restoreBefore?.();
      while (
        restoreBefore !== undefined &&
        value.history?.before !== undefined &&
        value.history.before > restoreBefore
      ) {
        if (signal.aborted || options.canRead?.() === false)
          throw new Error("Session restore cancelled.");
        const before = value.history.before;
        const earlier = await readEarlier(client, value, { signal });
        if (signal.aborted) throw new Error("Session restore cancelled.");
        if (earlier.history?.before !== undefined && earlier.history.before >= before)
          throw new Error("Transcript restore cursor did not advance.");
        value = earlier;
      }
      if (options.canRead?.() === false || value.session.id !== scope.sessionId)
        throw new RemoteHostError(
          scope.machineId,
          "identity",
          "Transcript project identity changed.",
        );
      if (value.projectId !== options.projectId)
        throw new SessionProjectMismatch(scope.sessionId, options.projectId, value.projectId);
      return value;
    },
    enabled,
    staleTime: 1_000,
    refetchInterval: (query) => {
      if (streaming && !streamFailing.current) return false;
      if (!enabled || query.state.fetchStatus === "fetching") return false;
      const kind = (query.state.error as { kind?: string } | null)?.kind;
      if (query.state.error instanceof SessionProjectMismatch) return false;
      if (kind === "auth" || kind === "identity" || kind === "unsupported") return false;
      return sessionReadSchedule(query, identity).delay(
        query.state.data?.status === "running",
        !!query.state.error,
        Date.now(),
        query.state.fetchFailureCount,
      );
    },
  });
  dataStamp.current = query.dataUpdatedAt;
  // A busy or briefly dropped stream is covered by the snapshot poll (and its quiet retries);
  // only a lasting stream failure replaces the transcript with an error.
  const streamError =
    streamFailure &&
    streamFailure.at === query.dataUpdatedAt &&
    !isTransientConnectionError(streamFailure.error)
      ? streamFailure.error
      : undefined;
  const denied =
    (streamError ?? query.error) instanceof SessionProjectMismatch ||
    ["auth", "identity"].includes(
      ((streamError ?? query.error) as { kind?: string } | null)?.kind ?? "",
    );
  return {
    ...query,
    error: streamError ?? query.error,
    isError: !!streamError || query.isError,
    streaming,
    connectionState: client?.connectionState?.() ?? "legacy-http",
    data: denied || !active ? undefined : (query.data ?? undefined),
    parked: !active,
  };
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
        current?.revision === loaded.revision ? retainSessionAuthority(current, loaded) : current,
      );
    },
  });
}

/** Block content stays valid until its own content digest changes, not whenever the session revision does. */
const BLOCK_GC_MS = 2 * 60_000;

export function useSessionBlock({
  scope,
  blockId,
  getRevision,
  digest,
  enabled,
}: SessionBlockRequest) {
  const client = useHostClient();
  const active = useHostReadActive();
  const cache = useQueryClient();
  // The Host pins a session revision per read; the key must not, or every revision refetches every block.
  // Legacy Hosts without digests key by the revision seen at render time.
  const identity = digest ? `digest:${digest}` : getRevision();
  const getRevisionRef = useRef(getRevision);
  getRevisionRef.current = getRevision;
  const queryKey = hostKey(scope.machineId, ["session-block", scope.sessionId, blockId, identity]);

  return useQuery({
    queryKey,
    enabled: !!client && active && enabled,
    gcTime: BLOCK_GC_MS,
    staleTime: digest ? Infinity : 0,
    queryFn: async ({ signal }) => {
      const response = await client!.request<SessionSyncResponse>(
        "sessions.block",
        { sessionId: scope.sessionId, blockId, revision: getRevisionRef.current() },
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
      // Drop superseded versions of this block so the cache holds one entry per block.
      for (const stale of cache.getQueryCache().findAll({ queryKey: queryKey.slice(0, -1) }))
        if (
          stale.queryKey.length === queryKey.length &&
          stale.queryKey[queryKey.length - 1] !== identity
        )
          cache.removeQueries({ queryKey: stale.queryKey, exact: true });
      return block;
    },
  });
}
