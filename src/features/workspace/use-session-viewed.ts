import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useConnectionScope } from "@/state/connection-scope";
import { captureSessionAuthority } from "@/domain/session-authority";
import type { HostSession } from "./wire";

/** Debounce for an output pause before acknowledging what was shown. */
const SETTLE_MS = 500;
/**
 * A running turn marks the session unread again with nearly every output, so while it runs the
 * acknowledgement (a Host write plus list refreshes) repeats at most this often. Leaving the
 * conversation or the run settling acknowledges what was shown right away.
 */
export const RUNNING_ACK_MS = 30_000;

/** Only the proven, visible foreground conversation acknowledges observed activity. */
export function useSessionViewed(
  machineId: string,
  session: HostSession | undefined,
  visible: boolean,
  canRead: () => boolean,
  /** The live stream already delivers this session's next revision; skip re-reading it. */
  streaming = false,
) {
  const active = useHostReadActive();
  const client = useHostClient();
  const connection = useConnectionScope();
  const cache = useQueryClient();
  const attempted = useRef<string | null>(null);
  const occupied = useRef(false);
  const held = useRef(false);
  const opening = useRef(true);
  const lastAck = useRef(0);
  /** A revision that was shown but whose acknowledgement waits out the running throttle. */
  const deferred = useRef<(() => void) | null>(null);
  const live = useRef(streaming);
  live.current = streaming;
  useEffect(
    () => () => {
      const flush = deferred.current;
      deferred.current = null;
      flush?.();
    },
    [],
  );
  // Debounce activity bursts; background, privacy loss and replacement cancel acknowledgement.
  useEffect(() => {
    if (!active || !visible) {
      // What was already on screen during a throttled run is acknowledged as the view closes.
      const flush = deferred.current;
      deferred.current = null;
      flush?.();
      opening.current = true;
      attempted.current = null;
      return;
    }
    deferred.current = null;
    if (!client || !session || session.unread === undefined || !canRead() || held.current) return;
    if (!session.unread) { opening.current = false; return; }
    if (session.forceUnread && !opening.current) return;
    const identity = `${session.session.id}:${session.revision}`;
    if (attempted.current === identity) return;
    const acknowledge = () => {
      if (!connection.isCurrent() || !canRead() || occupied.current) return;
      attempted.current = identity;
      opening.current = false;
      occupied.current = true;
      lastAck.current = Date.now();
      void client.request("sessions.update", {
        projectId: session.projectId, sessionId: session.session.id,
        unread: false, expectedRevision: session.revision, ...captureSessionAuthority(session),
      }).then(async () => {
        if (!connection.isCurrent() || !canRead()) return;
        await Promise.all([
          // The live stream carries the acknowledged revision; only a polled view re-reads it.
          live.current
            ? undefined
            : cache.invalidateQueries({ queryKey: hostKey(machineId, ["session", session.session.id]) }),
          cache.invalidateQueries({ queryKey: hostKey(machineId, ["sessions", session.projectId]) }),
          cache.invalidateQueries({ queryKey: hostKey(machineId, ["project-summaries"]) }),
        ]);
      }).catch((error: unknown) => {
        // Unknown writes never automatically replay while this conversation remains mounted.
        if (error && typeof error === "object" && "uncertain" in error && error.uncertain) held.current = true;
      }).finally(() => { occupied.current = false; });
    };
    const throttled = session.status === "running" && lastAck.current > 0;
    const delay = throttled ? Math.max(SETTLE_MS, lastAck.current + RUNNING_ACK_MS - Date.now()) : SETTLE_MS;
    if (throttled) deferred.current = acknowledge;
    const timer = setTimeout(() => {
      deferred.current = null;
      acknowledge();
    }, delay);
    return () => clearTimeout(timer);
  }, [active, visible, client, session, canRead, connection, cache, machineId]);
}
