import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";
import type { NotificationSettings } from "../contracts";
import { createNotificationSaves, type PutSettings, type SaveControl } from "../model/notification-saves";

/**
 * Per-control save state for the notification settings cache: `pending` counts the requests a
 * control has in flight (disable only that row), `failures` holds the retry action of each
 * control whose last request failed. The cache under `key` shows the optimistic value.
 */
export function useNotificationSaves(key: QueryKey) {
  const queries = useQueryClient();
  const [pending, setPending] = useState<Record<string, number>>({});
  const [failures, setFailures] = useState<Record<string, () => void>>({});
  const [saves] = useState(() =>
    createNotificationSaves({
      current: () => queries.getQueryData<NotificationSettings>(key),
      show: (settings) => {
        queries.setQueryData(key, settings);
      },
      track: (id, delta) =>
        setPending((counts) => {
          const next = { ...counts };
          const count = (next[id] ?? 0) + delta;
          if (count > 0) next[id] = count;
          else delete next[id];
          return next;
        }),
      mark: (id, retry) =>
        setFailures((current) => {
          const next = { ...current };
          if (retry) next[id] = retry;
          else delete next[id];
          return next;
        }),
    }),
  );
  return {
    pending,
    failures,
    adopt: saves.adopt,
    save: <T,>(control: SaveControl<T>, value: T, put: PutSettings) => saves.save(control, value, put),
  };
}
