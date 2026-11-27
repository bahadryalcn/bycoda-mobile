import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Only one busy indicator moves at a time. A run can mount several at once (the activity bar,
 * a "Writing…" line, running tool rows), and each orb and shimmer redraws every frame: the one
 * with the highest priority (then the earliest) animates, the rest keep their still frame.
 */
const animationClaims = new Map<number, number>();
const animationListeners = new Set<() => void>();
let animationLead: number | undefined;
let animationSequence = 0;
function electAnimationLead() {
  let next: number | undefined;
  for (const [id, priority] of animationClaims)
    if (next === undefined || priority > animationClaims.get(next)!) next = id;
  if (next === animationLead) return;
  animationLead = next;
  for (const listener of animationListeners) listener();
}
function subscribeAnimationLead(listener: () => void) {
  animationListeners.add(listener);
  return () => {
    animationListeners.delete(listener);
  };
}
/** Whether this indicator may animate: it wants to, and it holds the single animation lead. */
export function useAnimationLead(wants: boolean, priority = 0): boolean {
  const [id] = useState(() => ++animationSequence);
  useEffect(() => {
    if (!wants) return;
    animationClaims.set(id, priority);
    electAnimationLead();
    return () => {
      animationClaims.delete(id);
      electAnimationLead();
    };
  }, [id, wants, priority]);
  // Until the first claim is elected (one commit) nobody holds the lead, so this one may move.
  const isLead = () => animationLead === undefined || animationLead === id;
  const lead = useSyncExternalStore(subscribeAnimationLead, isLead, isLead);
  return wants && lead;
}
