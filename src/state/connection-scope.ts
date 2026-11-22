import { useCallback, useState, useSyncExternalStore } from "react";
import { randomUUID } from "expo-crypto";
import { isMachinePending, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { MobileMachine } from "@/remote/types";
import { useMachines } from "@/state/machines";

/**
 * A reviewed connection epoch: the identity fields that were reviewed, an opaque
 * token that changes whenever they do (including A -> B -> A re-pairing), and a
 * resource that lives and dies with this epoch (for example a request cache).
 */
export type ConnectionScope<T = undefined> = {
  readonly token: string;
  readonly review: ReviewedMachine | undefined;
  readonly resource: T;
  /** Checks the issued epoch itself, including store events before React commits. */
  isCurrent(): boolean;
};

export function sameReviewedMachine(a: ReviewedMachine | undefined, b: ReviewedMachine | undefined) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.endpoint === b.endpoint && a.environmentId === b.environmentId && a.lanKey === b.lanKey;
}

/** Two scopes are the same epoch only when the same issued token is presented; never by shape. */
export function sameConnectionEpoch(a: Pick<ConnectionScope<unknown>, "token">, b: Pick<ConnectionScope<unknown>, "token">) {
  return a.token === b.token;
}

function createScopeOwner<T>(resource: () => T) {
  let current: { scope: ConnectionScope<T>; blocked: boolean } | undefined;
  let credentialRevision = 0;
  let subscribers = 0;
  let subscribed = false;
  return {
    connect() {
      subscribed = true;
      subscribers++;
      return () => {
        subscribers--;
        // StrictMode's immediate subscription replay keeps the same authority;
        // a genuinely detached view rejects callbacks synchronously and retires.
        queueMicrotask(() => { if (!subscribers) current = undefined; });
      };
    },
    sync(machine: MobileMachine | undefined, revision: number, blocked: boolean) {
      const review = reviewedMachine(machine);
      if (current && revision === credentialRevision && sameReviewedMachine(current.scope.review, review)) {
        if (current.blocked !== blocked) current = { scope: current.scope, blocked };
        return current;
      }
      credentialRevision = revision;
      const scope: ConnectionScope<T> = Object.freeze({ token: randomUUID(), review, resource: resource(),
        isCurrent: () => current?.scope === scope && !current.blocked && (!subscribed || subscribers > 0) });
      current = { scope, blocked };
      return current;
    },
  };
}

/**
 * Explicit lifecycle owner for a reviewed connection epoch. React state (not a
 * memo, which React may discard) keeps the owner until the reviewed endpoint,
 * environment or credential changes; ordinary re-renders and machine-object
 * churn never issue a new epoch. Every canonical store event is observed before
 * notifying React, so batched A/B/A re-pairing cannot revive an old authority.
 */
export function useConnectionScope<T = undefined>(
  resource: () => T = () => undefined as T,
): ConnectionScope<T> {
  const [owner] = useState(() => createScopeOwner(resource));
  const snapshot = useCallback(() => {
    const state = useMachines.getState();
    const machine = state.machines.find((value) => value.id === state.activeId);
    const revision = machine ? state.credentialRevisions?.get(machine.id) ?? 0 : 0;
    const blocked = state.hydrated === false || !!state.storageError || isMachinePending(state, state.activeId);
    return owner.sync(machine, revision, blocked);
  }, [owner]);
  const subscribe = useCallback((notify: () => void) => {
    const release = owner.connect();
    const unsubscribe = useMachines.subscribe(() => { snapshot(); notify(); });
    return () => { unsubscribe(); release(); };
  }, [snapshot, owner]);
  return useSyncExternalStore(subscribe, snapshot, snapshot).scope;
}
