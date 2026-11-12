import { useEffect } from "react";

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
  const feed = widgetFeedFromActivity(machineId, activity);
  const identity = JSON.stringify(feed);
  useEffect(() => {
    useWidgetFeedStore.getState().set(feed);
    // The identity string covers every field of `feed`.
  }, [identity]);
  useEffect(() => () => useWidgetFeedStore.getState().set(emptyFeed), []);
}
