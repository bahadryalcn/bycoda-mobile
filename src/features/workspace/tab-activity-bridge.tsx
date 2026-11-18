import { useEffect } from "react";
import { create } from "zustand";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import type { HostAttentionInbox } from "@/domain/types";
import { useInboxHasUnseen, useInboxSeen } from "../inbox/inbox-seen-store";
import { useWidgetFeed } from "../widgets";
import { useProjectActivity } from "./use-project-activity";

/** Running-session count for the Sessions tab badge; written only by the bridge below. */
export const useRunningSessionBadge = create<{ count: number }>(() => ({ count: 0 }));
/** Unseen attention items for the Inbox tab dot; written only by the bridge below. */
export const useInboxUnseenBadge = create<{ unseen: boolean }>(() => ({ unseen: false }));

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
  return <InboxUnseenBridge machineId={machineId} />;
}

/** Same query key as the Inbox screen's all-projects scope, so the two share one poll. */
function InboxUnseenBridge({ machineId }: { machineId: string | undefined }) {
  const inbox = useHostQuery<HostAttentionInbox>(["inbox", null], "inbox.list", {}, { interval: 30_000, enabled: !!machineId });
  const items = machineId ? inbox.data?.items.filter((item) => item.kind !== "social") : undefined;
  const unseen = useInboxHasUnseen(machineId, items);
  const seeded = useInboxSeen((s) => (machineId ? !!s.machines[machineId]?.seeded : false));
  // Effect reason: the first sighting of a computer's inbox seeds the store so old items are not news.
  useEffect(() => {
    if (machineId && items && !seeded) void useInboxSeen.getState().seedIfNeeded(machineId, items);
  }, [machineId, items, seeded]);
  // Effect reason: publish the dot to the dock and rail without re-rendering the navigator.
  useEffect(() => {
    useInboxUnseenBadge.setState({ unseen });
    return () => useInboxUnseenBadge.setState({ unseen: false });
  }, [unseen]);
  return null;
}
