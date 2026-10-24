import { useEffect, useRef, useState } from "react";

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
    try {
      await refresh();
    } catch {
      // The query owner renders its error/retry state.
    } finally {
      pending.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }
  return { refreshing, onRefresh };
}
