import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createConnectionFeedbackStore, type ConnectionFeedbackStore } from "./connection-feedback-store";

const Scope = createContext<ConnectionFeedbackStore | null>(null);
const SharedReadScope = createContext<ConnectionFeedbackStore | null>(null);
let nextOrder = 0;

/** One region (sheet or screen) in which a connection-level problem is shown once. */
export function ConnectionFeedbackScope({ children, sharedReads }: PropsWithChildren<{ sharedReads?: boolean }>) {
  const [store] = useState(createConnectionFeedbackStore);
  if (sharedReads) return <SharedReadScope value={store}>{children}</SharedReadScope>;
  return <Scope value={store}>{children}</Scope>;
}

/**
 * True when this query state should render its connection-level feedback: outside a scope,
 * when it owns the scope, or before ownership settles (the first frame never hides it).
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
    store.claim(id, order, sharedRead ? () => latestRetry.current?.() : undefined);
    return () => store.release(id);
  }, [active, store, id, order, sharedRead]);
  const owner = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => store?.owner(),
    () => store?.owner(),
  );
  return {
    visible: !store || !active || owner === undefined || owner === id,
    retry: sharedRead && active ? sharedStore?.retry : undefined,
  };
}
