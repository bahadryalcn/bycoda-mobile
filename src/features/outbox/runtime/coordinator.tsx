import { useEffect, useRef } from "react";
import { focusManager, onlineManager, useQueryClient } from "@tanstack/react-query";
import { useHostClient, hostKey } from "@/state/queries";
import { useAccount } from "@/features/account/ui/account-context";
import { isAppContentVisible, useSecurity } from "@/state/security";
import { useMachines } from "@/state/machines";
import { sendOutbox } from "./store";
import { flushOutboxSession } from "./delivery";
import { outboxProjectVisible } from "./project-access";

const retries = new Set<(sessionId?: string) => void>();
export function retryOutbox(sessionId: string) { retries.forEach(retry => retry(sessionId)); }

/** Mount under AccountProvider, outside AccountGate, so sign-out revokes pending sends. */
export function OutboxCoordinator() {
  const account = useAccount();
  const client = useHostClient();
  const cache = useQueryClient();
  const latest = useRef({ account, client });
  latest.current = { account, client };
  useEffect(() => {
    // Observe durable account transitions even while the workspace gate is closed.
    if (account.status === "loading") return;
    const accountId = account.status === "signedIn" ? account.device?.id : null;
    if (account.status === "signedIn" && !accountId) return;
    void sendOutbox.dropAccount(accountId ?? null).catch(() => {});
  }, [account.status, account.device?.id]);
  useEffect(() => {
    // Reconnect, foreground and explicit retry share one per-session flight owner.
    // The safety tick reads storage only while a waiting row may exist: any outbox write re-arms it.
    let maybeWaiting = true, writes = 0;
    const written = sendOutbox.subscribe(() => { maybeWaiting = true; writes++; });
    const run = (sessionId?: string) => {
      const accountId = account.device?.id;
      if (!client || account.status !== "signedIn" || !accountId) return;
      const sameAccount = () => latest.current.account.status === "signedIn" && latest.current.account.device?.id === accountId;
      const current = () => latest.current.client === client && sameAccount() && useSecurity.getState().status === "unlocked" &&
        useSecurity.getState().appState === "active" && isAppContentVisible() && useMachines.getState().activeId === client.machine.id;
      if (!current() || !onlineManager.isOnline() || !focusManager.isFocused()) return;
      void (async () => {
        const seen = writes;
        const rows = await sendOutbox.all();
        // A write during the read may have added a waiting row the read missed.
        if (writes === seen) maybeWaiting = rows.some(row => row.machineId === client.machine.id && row.status === "waiting");
        const sessions = new Set(rows.filter(row => row.machineId === client.machine.id &&
          (row.status === "waiting" || (!!sessionId && row.status === "blocked")) &&
          (!sessionId || row.sessionId === sessionId)).map(row => row.sessionId));
        for (const id of sessions) {
          if (!current()) return;
          const row = rows.find(row => row.sessionId === id && row.machineId === client.machine.id);
          const accessible = () => current() && !!row && outboxProjectVisible(cache, client.machine, row.projectId);
          if (!accessible()) continue;
          await flushOutboxSession(client, id, accountId, accessible, !!sessionId, sameAccount);
          await cache.invalidateQueries({ queryKey: hostKey(client.machine.id, ["session", id]) });
        }
      })().catch(() => {});
    };
    retries.add(run);
    const online = onlineManager.subscribe(() => run());
    const foreground = focusManager.subscribe(() => run());
    const reconnect = setInterval(() => { if (maybeWaiting) run(); }, 15_000);
    run();
    return () => { retries.delete(run); online(); foreground(); written(); clearInterval(reconnect); };
  }, [client, account.status, account.device?.id, cache]);
  return null;
}
