import { useEffect, useRef, useState } from "react";

type LoadContext = {
  /** False once this load was superseded or the owner unmounted. */
  live: () => boolean;
  /** Surfaces a load problem as the shared operation error while the load is still live. */
  fail: (error: unknown) => void;
};

/**
 * Shared plumbing for reviewed desktop operations: it reads the saved receipt once, then owns
 * the busy flag, the pending action key, the shared error and single-flight `run`. Screens keep
 * their own review, receipt, claim and clear semantics.
 */
export function useReviewedOperation<T>({
  source,
  load,
  enabled = true,
  canRun,
  onFailure,
}: {
  /** Identity of the receipt storage; a different source reads again. */
  source: unknown;
  /** Reads the saved receipt (or receipts) for `source`. */
  load: (context: LoadContext) => Promise<T | null>;
  /** False when there is nothing to read; the load then completes immediately. */
  enabled?: boolean;
  /** Evaluated when an action starts; false ignores the request without side effects. */
  canRun: () => boolean;
  /** Runs after an action failed, in addition to recording the error. */
  onFailure?: (cause: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("primary");
  const occupied = useRef(false);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let live = true;
    void loader
      .current({
        live: () => live,
        fail: (cause) => {
          if (live) setError(cause);
        },
      })
      .then(
        (value) => {
          if (!live) return;
          setLoaded(value);
          setReady(true);
        },
        (cause) => {
          if (live) setError(cause);
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [source, enabled]);
  const run = async (action: () => Promise<unknown>, actionKey = "primary") => {
    if (occupied.current || !canRun()) return;
    occupied.current = true;
    setPendingAction(actionKey);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause);
      onFailure?.(cause);
    } finally {
      occupied.current = false;
      setBusy(false);
    }
  };
  return {
    /** The saved receipt (null when none); update it after claiming or clearing. */
    loaded,
    setLoaded,
    /** True only after the receipt read succeeded. */
    ready,
    loading,
    error,
    setError,
    busy,
    pendingAction,
    /** True while an action runs; also usable as a guard for work outside `run`. */
    occupied,
    run,
  };
}
