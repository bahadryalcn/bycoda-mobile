import { useEffect, useState } from "react";

/** How long the account gate waits for the sign-in provider before it offers a way out of the spinner. */
export const ACCOUNT_LOAD_DEADLINE_MS = 8_000;

/**
 * Bounds the account loading wait. After the deadline `stalled` turns true; `retry` starts a fresh
 * wait. Mount it only while the provider is loading: leaving that state unmounts it and the wait ends.
 */
export function useAccountLoadDeadline(deadlineMs = ACCOUNT_LOAD_DEADLINE_MS) {
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Arms one deadline per wait; Retry (attempt) re-arms it and unmount clears it.
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), deadlineMs);
    return () => clearTimeout(timer);
  }, [deadlineMs, attempt]);
  return {
    stalled,
    retry: () => {
      setStalled(false);
      setAttempt((count) => count + 1);
    },
  };
}
