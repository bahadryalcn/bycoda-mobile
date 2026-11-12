import { useEffect } from "react";
import { create } from "zustand";
import { useActiveMachine } from "@/state/machines";
import { useWidgetFeed } from "../widgets";
import { useProjectActivity } from "./use-project-activity";

/** Running-session count for the Sessions tab badge; written only by the bridge below. */
export const useRunningSessionBadge = create<{ count: number }>(() => ({ count: 0 }));

/**
 * Owns the shell-level project activity subscription and widget feed so the tab navigator
 * itself never re-renders on activity updates. Renders nothing.
 */
export function TabActivityBridge() {
  const machineId = useActiveMachine()?.id;
  const activity = useProjectActivity();
  useWidgetFeed(activity);
  const count = machineId && activity.complete ? activity.sessions.length : 0;
  useEffect(() => {
    useRunningSessionBadge.setState({ count });
    return () => useRunningSessionBadge.setState({ count: 0 });
  }, [count]);
  return null;
}
