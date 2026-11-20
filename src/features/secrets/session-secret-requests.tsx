import { useEffect, useMemo, useState } from "react";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { remoteErrorKind } from "@/ui/error-message";
import { SecretRequestCard } from "./secret-request-card";
import {
  answerSecretRequest,
  nextSecretExpiryDelay,
  SECRET_INPUT_CAPABILITY,
  SecretInputListResultSchema,
  secretExpired,
  secretPollInterval,
  secretSignalDelay,
} from "./secret-request-model";

/** Only pending metadata enters query state; values stay inside the masked card. */
export function SessionSecretRequests({
  machineId,
  sessionId,
  disabled,
}: {
  machineId: string;
  sessionId: string;
  disabled: boolean;
}) {
  const client = useHostClient();
  const copy = useCopy();
  const active = useHostReadActive();
  const enabled =
    active &&
    !!client &&
    client.machine.id === machineId &&
    !disabled &&
    !!client.machine.capabilities?.includes(SECRET_INPUT_CAPABILITY);
  const cache = useQueryClient();
  const key = useMemo(() => ["secret-inputs", machineId, sessionId], [machineId, sessionId]);
  const pending = useQuery({
    queryKey: key,
    enabled,
    queryFn: async ({ signal }) =>
      SecretInputListResultSchema.parse(
        await client!.request("secrets.input.list", { sessionId }, { signal, retry: false }),
      ),
    // Bounded fallback only: session updates (below) and answers refresh the list sooner.
    refetchInterval: (query) =>
      secretPollInterval(query.state.fetchFailureCount, remoteErrorKind(query.state.error)),
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
  const requests = useMemo(
    () => pending.data?.requests.filter((request) => request.sessionId === sessionId) ?? [],
    [pending.data, sessionId],
  );
  // Reason: a session update (new tool call, answer elsewhere) is the push signal for the list;
  // the transcript's own stream or snapshot read already delivers it, so no extra polling.
  useEffect(() => {
    if (!enabled) return;
    const sessionHash = hashKey(hostKey(machineId, ["session", sessionId]));
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      last = Date.now();
      void cache
        .invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false })
        .catch(() => undefined);
    };
    const release = cache.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.action.type !== "success" ||
        event.query.queryHash !== sessionHash ||
        timer
      )
        return;
      const wait = secretSignalDelay(last, Date.now());
      if (wait === 0) refresh();
      else timer = setTimeout(refresh, wait);
    });
    return () => {
      release();
      if (timer) clearTimeout(timer);
    };
  }, [cache, enabled, key, machineId, sessionId]);
  const [now, setNow] = useState(() => Date.now());
  // Reason: expiry is a timer on the earliest deadline, not a render tick; a new list or a
  // fired timer re-arms it for the next deadline.
  useEffect(() => {
    const delay = nextSecretExpiryDelay(requests, Date.now());
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay + 1);
    return () => clearTimeout(timer);
  }, [requests, now]);
  // A fresh read is never older than its own fetch time, so a stale `now` cannot show an expired request.
  const clock = Math.max(now, pending.dataUpdatedAt);
  if (!enabled) return null;
  return (
    <>
      {requests
        .filter((request) => !secretExpired(request, clock))
        .map((request) => (
          <SecretRequestCard
            key={`${machineId}:${request.id}:${request.signature}`}
            request={{
              ...request,
              title: copy("Gizli bilgi isteği", "Secret request"),
              confirmLabel: copy("Gizli bilgiyi kaydet", "Save secret"),
              cancelLabel: copy("İptal", "Cancel"),
            }}
            expired={false}
            onAnswer={async (answer) => {
              try {
                await answerSecretRequest(client!, request, answer);
              } finally {
                await pending.refetch();
              }
            }}
          />
        ))}
    </>
  );
}
