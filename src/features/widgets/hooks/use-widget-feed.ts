import { useEffect, useMemo } from "react";

import { useActiveMachine } from "@/state/machines";

import {
  emptyFeed,
  useWidgetFeedStore,
  widgetFeedFromActivity,
  type ActivityLike,
} from "../model/widget-feed";

/**
 * Called once beside the existing `useProjectActivity()` consumer (it needs navigation
 * context). It forwards the already privacy-filtered directory to the coordinator and
 * clears the feed when that screen unmounts, for example while the app is locked.
 */
export function useWidgetFeed(activity: ActivityLike) {
  const machineId = useActiveMachine()?.id ?? null;
  const { directory, directoryReady, privacyPending, privacyUnavailable, complete, error } = activity;
  const projects = activity.projects?.data;
  // The activity object is new on every render; the directory keeps its identity while the
  // sessions are unchanged, so the feed is only rebuilt and serialized when an input moves.
  const feed = useMemo(
    () =>
      widgetFeedFromActivity(machineId, {
        projects: { data: projects },
        directory,
        directoryReady,
        privacyPending,
        privacyUnavailable,
        complete,
        error,
      }),
    [machineId, projects, directory, directoryReady, privacyPending, privacyUnavailable, complete, error],
  );
  const identity = useMemo(() => JSON.stringify(feed), [feed]);
  useEffect(() => {
    useWidgetFeedStore.getState().set(feed);
    // The identity string covers every field of `feed`.
  }, [identity]);
  useEffect(() => () => useWidgetFeedStore.getState().set(emptyFeed), []);
}
