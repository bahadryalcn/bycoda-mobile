import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "@/ui/typography";
import { PressableCard, QueryState, Sheet } from "@/ui/primitives";
import { pushOnce } from "@/ui/navigation";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import type { Block } from "@/domain/types";
import { formatElapsed } from "./run-status-model";
import { agentCountText } from "./session-activity-model";
import { useSessionAgentRuns } from "./session-agent-runs";
import { useSessionBlock } from "./session-queries";
import type { TranscriptBlockProps } from "./session-types";
import { SubagentDetails } from "./subagent-details";
import { RunAvatars, SubagentRunRow, useRunToneColor } from "./subagent-run-row";
import {
  countRuns,
  groupElapsedMs,
  isLiveRun,
  runGroupTitle,
  subagentRunLayout,
  subagentRunView,
  visibleGroupRuns,
  type RunTone,
  type SubagentRunView,
} from "./subagent-run-model";
import { useElapsedNow } from "./use-elapsed-now";

type Props = Pick<TranscriptBlockProps, "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider" | "getRevision"> & {
  blocks: readonly Block[];
  /** This turn's runs may still work: the session is live and this is its latest turn. */
  live: boolean;
  /** The run an active find hit is on: its group opens. */
  focusRunId?: string;
  /** Bumped by find's "open matching activity" to open `focusRunId`'s details or child session. */
  openRunNonce?: number;
};

const NO_CHILDREN: never[] = [];

/**
 * A turn's subagents in the transcript, outside the turn's work fold: one flat row, or a header with
 * the runs' marks, count, tally and span over their rows. A group is open while any run works and
 * folds once all settle; failures stay visible either way. A run that is its own session opens it;
 * any other opens its steps and report.
 */
export function TranscriptSubagents({ blocks, live, focusRunId, openRunNonce, ...props }: Props) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const toneColor = useRunToneColor();
  const children = useSessionAgentRuns()?.children ?? NO_CHILDREN;
  const views = blocks.map((block) => subagentRunView(block, { live, children, parentProvider: props.parentProvider }));
  const running = views.some((view) => isLiveRun(view.state));
  const now = useElapsedNow(running);
  const [toggled, setToggled] = useState<boolean>();
  const [selectedId, setSelectedId] = useState<string>();
  const open = toggled ?? running;
  const openRun = (view: SubagentRunView) => {
    const child = view.child;
    if (child) {
      // Only a child this session still lists opens; the route keeps this computer.
      if (!children.some((entry) => entry.sessionId === child.sessionId && entry.projectId === child.projectId)) return;
      pushOnce({ pathname: "/session/[id]", params: { id: child.sessionId, machineId: props.scope.machineId, projectId: child.projectId } });
      return;
    }
    if (view.blockId) setSelectedId(view.blockId);
  };
  // A find hit on one of these runs opens the group; the user can still fold it again.
  useEffect(() => {
    if (focusRunId) setToggled(true);
  }, [focusRunId]);
  // A request already pending when this row mounted (a remount after scrolling) is not repeated.
  const handledNonce = useRef(openRunNonce);
  const openRunRef = useRef(openRun);
  openRunRef.current = openRun;
  const viewsRef = useRef(views);
  viewsRef.current = views;
  useEffect(() => {
    if (!openRunNonce || handledNonce.current === openRunNonce) return;
    handledNonce.current = openRunNonce;
    const view = viewsRef.current.find((candidate) => candidate.blockId === focusRunId);
    if (view) openRunRef.current(view);
  }, [openRunNonce, focusRunId]);
  const selectedBlock = selectedId ? blocks.find((block) => block.id === selectedId) : undefined;
  const selectedView = selectedId ? views.find((view) => view.blockId === selectedId) : undefined;
  // Mounted only for a selected run; a hidden sheet per transcript row is not kept around.
  const details = selectedBlock ? (
    <Sheet visible title={selectedView?.name || copy("Alt ajan ayrıntıları", "Subagent details")} size="full" scroll={false}
      onClose={() => setSelectedId(undefined)}>
      <RunDetails block={selectedBlock} interrupted={selectedView?.state === "interrupted"} {...props} />
    </Sheet>
  ) : null;
  const row = (view: SubagentRunView) => (
    <SubagentRunRow key={view.id} view={view} now={now} onPress={() => openRun(view)} />
  );
  if (subagentRunLayout(views.length) === "row") return <View>{views.map(row)}{details}</View>;
  const counts = countRuns(views.map((view) => view.state));
  const tone: RunTone = running ? "live" : counts.failed ? "danger" : counts.stopped || counts.interrupted ? "warning" : "success";
  const elapsedMs = groupElapsedMs(views, now);
  const title = runGroupTitle(views.length, copy);
  const summary = agentCountText(counts, copy);
  const shown = visibleGroupRuns(views, open);
  return (
    <View>
      <PressableCard
        label={[title, agentCountText(counts, copy, true)].filter(Boolean).join(". ")}
        expanded={open}
        onPress={() => setToggled(!open)}
        style={{ minHeight: metrics.touchTarget, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderRadius: radii.badge }}
      >
        <RunAvatars views={views} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body numberOfLines={1} style={{ fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "600" }}>{title}</Body>
          {summary ? <Body numberOfLines={2} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: toneColor(tone), fontVariant: ["tabular-nums"] }}>{summary}</Body> : null}
        </View>
        {elapsedMs !== undefined ? (
          <Body muted style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontVariant: ["tabular-nums"], flexShrink: 0 }}>{formatElapsed(elapsedMs)}</Body>
        ) : null}
        <ChevronRight size={14} color={colors.tertiary} style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }} />
      </PressableCard>
      {shown.length ? <View style={{ paddingLeft: space.md }}>{shown.map(row)}</View> : null}
      {details}
    </View>
  );
}

/** The run's details; a block the Host sent without its full content is read first. */
function RunDetails({ block, interrupted, getRevision, ...props }: Omit<Props, "blocks" | "live"> & { block: Block; interrupted: boolean }) {
  const detail = useSessionBlock({ scope: props.scope, blockId: block.id, getRevision, digest: block.remoteContent?.digest, enabled: !!block.remoteContent });
  if (block.remoteContent && !detail.data) return <QueryState query={detail} loading="inline" compact />;
  return <SubagentDetails block={detail.data ?? block} interrupted={interrupted} {...props} />;
}
