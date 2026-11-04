import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { usePrivateContentAccess } from "./private-access";
import { mediaQueryKey, type MessageContext } from "./media-policy";

const clients = new WeakMap<object, number>(); let nextClient = 1;
/** Component identity only; this never changes a media cache key. */
export function readerInstanceKey(context: MessageContext, identity: string) {
  if (!clients.has(context.client)) clients.set(context.client, nextClient++);
  return JSON.stringify([clients.get(context.client), mediaQueryKey(context, [identity])]);
}

/** One mounted reader retains its reviewed target and retires every old read port. */
export function useReaderScope(context: MessageContext, identity: string) {
  const connection = useConnectionScope(), host = useHostClient();
  const active = useHostReadActive(), parent = usePrivateContentAccess();
  const [ready, setReady] = useState(false), mounted = useRef(false), closed = useRef(false);
  useLayoutEffect(() => { mounted.current = true; setReady(true); return () => { mounted.current = false; }; }, []);
  const target = JSON.stringify(mediaQueryKey(context, [identity]));
  const [opening] = useState(() => ({ connection, client: context.client, review: reviewedMachine(context.client.machine), target }));
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && target === opening.target && context.client === opening.client &&
    context.machineId === opening.review?.id && isReviewedMachine(opening.review, useMachines.getState());
  const available = ready && scopeCurrent && active && parent.allowed && parent.check() && !!host;
  const port = useMemo(() => ({}), [available, context.client]);
  const live = useRef({ available, parent, port }); live.current = { available, parent, port };
  const current = () => mounted.current && !closed.current && live.current.available && live.current.port === port &&
    opening.connection.isCurrent() && isReviewedMachine(opening.review, useMachines.getState()) && live.current.parent.allowed && live.current.parent.check();
  const assertCurrent = () => { if (!current()) throw new Error("The original file reader is unavailable."); };
  const close = (onClose: () => void) => { if (mounted.current && !closed.current) { closed.current = true; onClose(); } };
  const access = useMemo(() => ({ allowed: available, check: current }), [port, available]);
  return { ready, available, port, current, assertCurrent, close, access };
}

export function useReaderContentAccess(scope: ReturnType<typeof useReaderScope>, proof: unknown, allowed: boolean) {
  const port = useMemo(() => ({}), [scope.port, proof, allowed]);
  const live = useRef({ port, allowed }); live.current = { port, allowed };
  const check = () => live.current.port === port && live.current.allowed && scope.current();
  const access = useMemo(() => ({ allowed, check }), [port, allowed]);
  return { port, check, access };
}

export function useReaderRetry(scope: ReturnType<typeof useReaderScope>, query: {
  isFetching: boolean; error: unknown; refetch(options?: { cancelRefetch?: boolean }): Promise<unknown>;
}) {
  const live = useRef(query); live.current = query;
  const pending = useRef<Promise<unknown> | null>(null);
  const retry = () => {
    if (!scope.current() || live.current.isFetching || pending.current) return;
    const request = query.refetch({ cancelRefetch: false }); pending.current = request;
    void request.catch(() => {}).finally(() => { if (pending.current === request) pending.current = null; });
  };
  const retryError = () => { if (query.error && live.current.error === query.error) retry(); };
  return { retry, retryError };
}
