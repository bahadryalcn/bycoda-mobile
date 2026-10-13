import { useEffect, useRef } from "react";

/** Polling may remove a record, but an open editor still owns its unsaved snapshot. */
export function useEditorRecord<T>(key: string | null, value: T | undefined) {
  const retained = useRef<{ key: string; value: T } | null>(null);
  useEffect(() => {
    if (!key) retained.current = null;
    else if (value !== undefined) retained.current = { key, value };
  }, [key, value]);
  return value ?? (key && retained.current?.key === key ? retained.current.value : undefined);
}
