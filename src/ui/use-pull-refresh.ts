import { useEffect, useRef, useState } from "react";

/**
 * A pull's indicator stays at least this long. A cached or instant refresh would otherwise end
 * before the native control finished appearing, which leaves it stuck (iOS) or flickering.
 */
export const PULL_REFRESH_MIN_MS = 400;

/** Only a user pull owns this indicator; polling keeps cached content quiet. */
export function usePullRefresh(refresh: (() => unknown) | undefined) {
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function onRefresh() {
    if (!refresh || pending.current) return;
    pending.current = true;
    setRefreshing(true);
    const started = Date.now();
    try {
      await refresh();
    } catch {
      // The query owner renders its error/retry state.
    } finally {
      const remaining = PULL_REFRESH_MIN_MS - (Date.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      pending.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }
  return { refreshing, onRefresh };
}
