import { useState } from "react";
import { randomUUID } from "expo-crypto";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { MobileMachine } from "@/remote/types";

/**
 * A reviewed connection epoch: the identity fields that were reviewed, an opaque
 * token that changes whenever they do (including A -> B -> A re-pairing), and a
 * resource that lives and dies with this epoch (for example a request cache).
 */
export type ConnectionScope<T = undefined> = {
  readonly token: string;
  readonly review: ReviewedMachine | undefined;
  readonly resource: T;
};

export function sameReviewedMachine(a: ReviewedMachine | undefined, b: ReviewedMachine | undefined) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.endpoint === b.endpoint && a.environmentId === b.environmentId && a.lanKey === b.lanKey;
}

/** Two scopes are the same epoch only when the same issued token is presented; never by shape. */
export function sameConnectionEpoch(a: Pick<ConnectionScope<unknown>, "token">, b: Pick<ConnectionScope<unknown>, "token">) {
  return a.token === b.token;
}

function issue<T>(review: ReviewedMachine | undefined, resource: () => T): ConnectionScope<T> {
  return Object.freeze({ token: randomUUID(), review, resource: resource() });
}

/**
 * Explicit lifecycle owner for a reviewed connection epoch. React state (not a
 * memo, which React may discard) keeps the epoch until the reviewed endpoint,
 * environment or credential changes; ordinary re-renders and machine-object
 * churn never issue a new epoch.
 */
export function useConnectionScope<T = undefined>(
  machine: MobileMachine | null | undefined,
  resource: () => T = () => undefined as T,
): ConnectionScope<T> {
  const review = reviewedMachine(machine);
  const [scope, setScope] = useState(() => issue(review, resource));
  if (sameReviewedMachine(scope.review, review)) return scope;
  // Adjusting state while rendering is React's supported derived-state path: the
  // stale render is discarded and every consumer sees only the new epoch.
  const next = issue(review, resource);
  setScope(next);
  return next;
}
