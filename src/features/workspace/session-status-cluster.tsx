import { View, type LayoutChangeEvent } from "react-native";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import CircleDot from "lucide-react-native/icons/circle-dot";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import Users from "lucide-react-native/icons/users";
import { FloatingRoundButton, FloatingStatusCapsule, type FloatingStatusSegment } from "@/ui/floating-status";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import { activityStateLabel, agentCountText, type SessionActivity } from "./session-activity-model";
import { goalSegmentText, goalStatusLabel, type ClusterSegments } from "./session-status-cluster-model";
import { agentsPillLabel, agentsPillText } from "./subagent-run-model";
import { liveTurnLabel } from "./transcript-format";
import { useElapsedNow } from "./use-elapsed-now";

/**
 * The session's floating status: one capsule above the composer with the run, the goal, the
 * subagents and the queue, and the circular "back to latest" above it while the list is scrolled up.
 * It stays in sight at every scroll position; each segment opens what it summarises.
 */
export function SessionStatusCluster({
  segments,
  activity,
  startedAt,
  unseen,
  onJump,
  onAgents,
  onCapsuleLayout,
}: {
  segments: ClusterSegments;
  activity: SessionActivity;
  /** Host-recorded start of the running turn. */
  startedAt?: number;
  /** New content arrived while the user read earlier messages. */
  unseen: boolean;
  onJump: () => void;
  onAgents?: () => void;
  /** The capsule alone: the list reserves its height, never the "back to latest" button's. */
  onCapsuleLayout: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const { status, goal, agents, queue } = segments;
  const now = useElapsedNow(status === "working" && startedAt !== undefined);
  const list: FloatingStatusSegment[] = [];
  if (status === "working" || status === "stopping")
    list.push({
      key: "status",
      text: liveTurnLabel({ startedAt, now, stopping: status === "stopping" }, copy),
      // The ticking clock stays out of the spoken label.
      label: `${status === "stopping" ? copy("Durduruluyor", "Stopping") : copy("Ajan çalışıyor", "Agent is working")}. ${copy("Son mesaja git", "Jump to latest")}`,
      busy: true,
      onPress: onJump,
    });
  else if (status) {
    const text = activityStateLabel(activity, copy);
    list.push({
      key: "status",
      text,
      busy: status === "waiting" || status === "background",
      tone: status === "needs-input" ? "warning" : status === "done" ? "success" : undefined,
      // Needs you, Done and waiting states are said once as they appear; the working clock never is.
      announcement: text,
      // An approval or question waits at the end of the transcript.
      ...(status === "done" ? {} : { label: `${text}. ${copy("Son mesaja git", "Jump to latest")}`, onPress: onJump }),
    });
  }
  if (goal)
    list.push({
      key: "goal",
      Icon: CircleDot,
      text: goalSegmentText(goal, copy),
      // Static text: the objective is spoken with it; there is no sheet to open.
      label: `${goalStatusLabel(goal, copy)}: ${goal.objective}`,
      tone: goal.status === "active" ? "accent" : goal.status === "paused" ? undefined : "warning",
    });
  if (agents && onAgents) {
    const active = agents.running + agents.queued > 0;
    list.push({
      key: "agents",
      Icon: Users,
      text: agentsPillText(agents, copy, (settled) => agentCountText(settled, copy)),
      label: `${copy("Ajanları aç", "Open agents")}. ${agentsPillLabel(agents, copy, (settled) => agentCountText(settled, copy, true))}`,
      tone: active ? "accent" : undefined,
      onPress: onAgents,
    });
  }
  if (queue)
    list.push({
      key: "queue",
      Icon: ListOrdered,
      text: queue.text,
      label: `${copy("Sırayı aç", "Open queue")}. ${queue.label}`,
      tone: queue.danger ? "danger" : undefined,
      onPress: queue.open,
    });
  if (!list.length && !segments.jump) return null;
  return (
    <View pointerEvents="box-none" style={{ alignSelf: "stretch", alignItems: "center", gap: space.sm }}>
      {segments.jump ? (
        <FloatingRoundButton
          label={unseen ? copy("Yeni mesajlar, son mesaja git", "New messages, jump to latest") : copy("Son mesaja git", "Jump to latest")}
          badge={unseen}
          onPress={onJump}
          icon={<ArrowDown size={iconSize.status} color={unseen ? colors.accent : colors.text} />}
        />
      ) : null}
      <FloatingStatusCapsule segments={list} onLayout={onCapsuleLayout} />
    </View>
  );
}
