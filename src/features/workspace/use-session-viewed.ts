import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient, useHostReadActive } from "@/state/queries";
import { useConnectionScope } from "@/state/connection-scope";
import { captureSessionAuthority } from "@/domain/session-authority";
import type { HostSession } from "./wire";

/** Only the proven, visible foreground conversation acknowledges observed activity. */
export function useSessionViewed(machineId: string, session: HostSession | undefined, visible: boolean, canRead: () => boolean) {
  const active = useHostReadActive();
  const client = useHostClient();
  const connection = useConnectionScope();
  const cache = useQueryClient();
  const attempted = useRef<string | null>(null);
  const occupied = useRef(false);
  const held = useRef(false);
  const opening = useRef(true);
  // Debounce activity bursts; blur, background, privacy loss and replacement cancel acknowledgement.
  useEffect(() => {
    if (!active || !visible) {
      opening.current = true;
      attempted.current = null;
      return;
    }
    if (!client || !session || session.unread === undefined || !canRead() || held.current) return;
    if (!session.unread) { opening.current = false; return; }
    if (session.forceUnread && !opening.current) return;
    const identity = `${session.session.id}:${session.revision}`;
    if (attempted.current === identity) return;
    const timer = setTimeout(() => {
      if (!connection.isCurrent() || !canRead() || occupied.current) return;
      attempted.current = identity;
      opening.current = false;
      occupied.current = true;
      void client.request("sessions.update", {
        projectId: session.projectId, sessionId: session.session.id,
        unread: false, expectedRevision: session.revision, ...captureSessionAuthority(session),
      }).then(async () => {
        if (!connection.isCurrent() || !canRead()) return;
        await Promise.all([
          cache.invalidateQueries({ queryKey: hostKey(machineId, ["session", session.session.id]) }),
          cache.invalidateQueries({ queryKey: hostKey(machineId, ["sessions", session.projectId]) }),
          cache.invalidateQueries({ queryKey: hostKey(machineId, ["project-summaries"]) }),
        ]);
      }).catch((error: unknown) => {
        // Unknown writes never automatically replay while this conversation remains mounted.
        if (error && typeof error === "object" && "uncertain" in error && error.uncertain) held.current = true;
      }).finally(() => { occupied.current = false; });
    }, 500);
    return () => clearTimeout(timer);
  }, [active, visible, client, session, canRead, connection, cache, machineId]);
}
