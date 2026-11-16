import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createConnectionFeedbackStore, type ConnectionFeedbackStore } from "./connection-feedback-store";

const Scope = createContext<ConnectionFeedbackStore | null>(null);
let nextOrder = 0;

/** One region (sheet or screen) in which a connection-level problem is shown once. */
export function ConnectionFeedbackScope({ children }: PropsWithChildren) {
  const [store] = useState(createConnectionFeedbackStore);
  return <Scope value={store}>{children}</Scope>;
}

/**
 * True when this query state should render its connection-level feedback: outside a scope,
 * when it owns the scope, or before ownership settles (the first frame never hides it).
 */
export function useConnectionFeedbackOwner(active: boolean): boolean {
  const store = useContext(Scope);
  const id = useId();
  // Render order within one commit is layout order, so the first section keeps the message.
  const [order] = useState(() => nextOrder++);
  // Claiming is tied to showing the state, so a recovered section hands the message on.
  useEffect(() => {
    if (!active || !store) return;
    store.claim(id, order);
    return () => store.release(id);
  }, [active, store, id, order]);
  const owner = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => store?.owner(),
    () => store?.owner(),
  );
  return !store || !active || owner === undefined || owner === id;
}
