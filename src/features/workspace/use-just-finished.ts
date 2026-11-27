import { useEffect, useState } from "react";

/** How long "Done" stays after a run ends. */
export const DONE_MS = 4000;

/**
 * True for a moment after a run that was live ends; clears early when work resumes. It turns on in
 * the same render the run ends, so the floating cluster's reserved band never drops for a frame
 * between "working" and "Done".
 */
export function useJustFinished(live: boolean): boolean {
  const [state, setState] = useState({ live, justFinished: false });
  let current = state;
  if (state.live !== live) {
    current = { live, justFinished: !live };
    setState(current);
  }
  const { justFinished } = current;
  useEffect(() => {
    if (!justFinished) return;
    const timer = setTimeout(() => setState((value) => (value.justFinished ? { ...value, justFinished: false } : value)), DONE_MS);
    return () => clearTimeout(timer);
  }, [justFinished]);
  return justFinished;
}
