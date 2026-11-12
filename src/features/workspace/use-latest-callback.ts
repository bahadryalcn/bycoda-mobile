import { useCallback, useLayoutEffect, useRef } from "react";

/** A stable function identity that always calls the latest closure, so memoised rows keep their props. */
export function useLatestCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
