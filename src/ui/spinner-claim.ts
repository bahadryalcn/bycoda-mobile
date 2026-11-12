import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * One spinner at a time: two identical busy glyphs for one operation (a toolbar menu and a Retry
 * button both refetching) read as a defect. Busy controls claim the spinner; the newest claim
 * draws it and the others stay busy (disabled, announced) without a second glyph. Skeletons,
 * progress lines and other indicator kinds are unaffected.
 */
let claims: readonly symbol[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly symbol[]) {
  claims = next;
  listeners.forEach((listener) => listener());
}

export function claimSpinner(id: symbol): () => void {
  publish([...claims.filter((claim) => claim !== id), id]);
  return () => publish(claims.filter((claim) => claim !== id));
}

/** True when `id` may draw the spinner: it holds the newest claim, . */
export function spinnerHolder(id: symbol, current: readonly symbol[] = claims): boolean {
  const last = current[current.length - 1];
  return last === undefined || last === id;
}

export function useSoleSpinner(busy: boolean): boolean {
  const id = useRef(Symbol("spinner")).current;
  useEffect(() => (busy ? claimSpinner(id) : undefined), [busy, id]);
  const newest = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => claims[claims.length - 1],
    () => undefined,
  );
  return busy && newest === id;
}
