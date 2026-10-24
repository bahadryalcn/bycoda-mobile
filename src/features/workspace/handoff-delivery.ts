import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient } from "@/state/queries";
import type { CommandReceipt } from "@/domain/types";
import type { SessionScope } from "./session-types";
import { dispatchCommand, UncertainCommand } from "./commands";

type Pending = { commandId: string; digest: string; mode?: "handoff" | "secondOpinion"; environmentId?: string };
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem" | "removeItem">;
const locks = new Map<string, Promise<unknown>>();
export const contextualPendingKey = (scope: SessionScope) => `bycoda.mobile.contextual-pending.v1:${JSON.stringify([scope.machineId, scope.sessionId])}`;
export function contextualPendingStore(storage: Storage, key: string) {
  const load = async (): Promise<Pending | null> => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    if (raw.length > 1024) throw new Error("Invalid saved context-transfer receipt");
    const value = JSON.parse(raw) as Pending;
    if (!value || typeof value.commandId !== "string" || value.commandId.length > 100 || !value.commandId ||
      typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest) ||
      value.mode !== undefined && !["handoff", "secondOpinion"].includes(value.mode) ||
      value.environmentId !== undefined && (typeof value.environmentId !== "string" || value.environmentId.length > 200))
      throw new Error("Invalid saved context-transfer receipt");
    return value;
  };
  const serialized = async <T,>(action: () => Promise<T>) => {
    const previous = locks.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(action);
    locks.set(key, pending);
    try { return await pending; } finally { if (locks.get(key) === pending) locks.delete(key); }
  };
  return { load,
    claim: (value: Pending) => serialized(async () => {
      const current = await load();
      if (current) return { pending: current, claimed: false };
      await storage.setItem(key, JSON.stringify(value));
      return { pending: value, claimed: true };
    }),
    clear: (commandId: string) => serialized(async () => {
      if ((await load())?.commandId === commandId) await storage.removeItem(key);
    }),
  };
}

/** Retain only an attempt ID/digest, never the outgoing context. Reopening reads receipts, never sends. */
export function useContextualDelivery(scope: SessionScope, projectId: string) {
  const client = useHostClient();
  const cache = useQueryClient();
  const store = useMemo(() => contextualPendingStore(AsyncStorage, contextualPendingKey(scope)), [scope.machineId, scope.sessionId]);
  const [loading, setLoading] = useState(true);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [receipt, setReceipt] = useState<CommandReceipt | null>(null);
  const [savedMode, setSavedMode] = useState<Pending["mode"]>();
  const origin = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accepted = async (value: CommandReceipt) => {
    if (!origin.current || value.commandId !== origin.current.commandId) throw new Error("The receipt belongs to another request");
    if (mounted.current) { setReceipt(value); setError(null); }
    // A cleanup failure must never turn an accepted request into a new send.
    try { await store.clear(value.commandId); } catch { /* The next opening reconciles this same receipt. */ }
    void cache.invalidateQueries({ queryKey: hostKey(scope.machineId, ["sessions", projectId]) });
  };
  useEffect(() => {
    if (!client || client.machine.id !== scope.machineId || busy.current) return;
    let active = true;
    void (async () => {
      try {
        const saved = await store.load();
        if (!active) return;
        origin.current = saved;
        setSavedMode(saved?.mode);
        if (saved) {
          if (saved.environmentId && saved.environmentId !== client.machine.environmentId)
            throw new Error("The saved request belongs to another computer identity");
          const found = await client.request<CommandReceipt | null>("commands.status", { commandId: saved.commandId });
          if (!active) return;
          if (found) await accepted(found); else setError(new UncertainCommand(saved.commandId, scope.machineId, client));
        }
      } catch (cause) {
        if (active) setError(origin.current && (!origin.current.environmentId || origin.current.environmentId === client.machine.environmentId)
          ? new UncertainCommand(origin.current.commandId, scope.machineId, client) : cause as Error);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, store]);
  const mutateAsync = async (params: Record<string, unknown>) => {
    if (!client || client.machine.id !== scope.machineId || loading || busy.current || origin.current || error)
      throw new Error("Resolve the saved context-transfer request before creating another");
    busy.current = true; setPending(true);
    try {
      const claimed = await store.claim({ commandId: randomUUID(), digest: String(params.previewDigest),
        ...(params.mode === "handoff" || params.mode === "secondOpinion" ? { mode: params.mode } : {}), environmentId: client.machine.environmentId });
      origin.current = claimed.pending;
      setSavedMode(claimed.pending.mode);
      if (!claimed.claimed) throw new UncertainCommand(claimed.pending.commandId, scope.machineId, client);
      const result = await dispatchCommand(client, claimed.pending.commandId, params);
      await accepted(result);
      return result;
    } catch (cause) {
      if (!(cause instanceof UncertainCommand) && origin.current) {
        try { await store.clear(origin.current.commandId); origin.current = null; } catch { /* No resend until storage can be read. */ }
      }
      if (mounted.current) setError(cause as Error);
      throw cause;
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  return { loading, isPending, error, receipt, savedMode, mutateAsync, acceptRecovered: accepted,
    reset: () => { if (!origin.current && !busy.current) setError(null); } };
}
