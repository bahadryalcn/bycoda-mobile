import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createConnectionFeedbackStore, type ConnectionFeedbackStore } from "./connection-feedback-store";

const Scope = createContext<ConnectionFeedbackStore | null>(null);
const SharedReadScope = createContext<ConnectionFeedbackStore | null>(null);
let nextOrder = 0;

/**
 * One region (sheet or screen) in which a failed read is reported once: the first failing section
 * owns the message and a Retry that retries every failed read of the region; later sections stay
 * quiet (connection-level problems) or show one status line.
 */
export function ConnectionFeedbackScope({ children, sharedReads }: PropsWithChildren<{ sharedReads?: boolean }>) {
  const [store] = useState(createConnectionFeedbackStore);
  if (sharedReads) return <SharedReadScope value={store}>{children}</SharedReadScope>;
  return <Scope value={store}>{children}</Scope>;
}

/**
 * `visible` is true when this query state should render its failure feedback: outside a scope,
 * when it owns the scope, or before ownership settles (the first frame never hides it).
 * `retry` (owner inside a scope) retries every failed read that claimed the scope.
 */
export function useConnectionFeedbackOwner(active: boolean, sharedRead: boolean, retry?: () => unknown) {
  const localStore = useContext(Scope);
  const sharedStore = useContext(SharedReadScope);
  const store = sharedRead ? sharedStore : localStore;
  const id = useId();
  const latestRetry = useRef(retry);
  latestRetry.current = retry;
  // Render order within one commit is layout order, so the first section keeps the message.
  const [order] = useState(() => nextOrder++);
  // Claiming is tied to showing the state, so a recovered section hands the message on.
  useEffect(() => {
    if (!active || !store) return;
    store.claim(id, order, () => latestRetry.current?.());
    return () => store.release(id);
  }, [active, store, id, order]);
  const owner = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => store?.owner(),
    () => store?.owner(),
  );
  return {
    visible: !store || !active || owner === undefined || owner === id,
    retry: active && store ? store.retry : undefined,
  };
}
