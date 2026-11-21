import { useState } from "react";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "@/ui/typography";
import { PressableCard, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { agentStateLabel, agentStateTone } from "./agent-state";
import { activityState } from "./transcript-model";
import { formatElapsed, subagentNow } from "./run-status-model";
import { useElapsedNow } from "./use-elapsed-now";
import { SubagentDetails } from "./subagent-details";
import type { TranscriptBlockProps } from "./session-types";

type Props = Pick<TranscriptBlockProps, "block" | "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider"> & {
  detailsDisabled?: boolean;
};

/**
 * Show the run's state and latest step. The details sheet owns model information and history.
 * Provider-internal runs have no session of their own; delegated child sessions open from the Agents sheet instead.
 */
export function SubagentCard({ block, detailsDisabled, ...props }: Props) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [sheet, setSheet] = useState(false);
  const run = block.agentRun;
  const state = activityState(block);
  const running = state === "running";
  const now = useElapsedNow(running);
  if (!run) return null;
  const end = run.endedAt ?? (running ? now : undefined);
  const elapsed = run.startedAt !== undefined && end !== undefined ? formatElapsed(end - run.startedAt) : undefined;
  const label = agentStateLabel(state, copy);
  const tone = agentStateTone(state, colors);
  const latest = subagentNow(block);
  const small = { fontSize: fontSize.caption, lineHeight: lineHeight.caption };
  return (
    <>
      <PressableCard
        label={[run.name, label, elapsed, latest].filter(Boolean).join(". ")}
        disabled={detailsDisabled}
        onPress={() => setSheet(true)}
        style={{ minHeight: metrics.touchTarget, gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.md, marginHorizontal: 0, borderRadius: radii.card, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.separator }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.row }}>
          <View style={{ width: 8, height: 8, borderRadius: radii.pill, backgroundColor: tone }} />
          <Body numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>{run.name}</Body>
          <Body numberOfLines={1} style={{ color: tone, flexShrink: 0 }}>{label}</Body>
          <View style={{ flex: 1 }} />
          {elapsed ? <Body muted style={{ fontVariant: ["tabular-nums"] }}>{elapsed}</Body> : null}
          <ChevronRight size={16} color={colors.tertiary} />
        </View>
        {latest ? <Body muted numberOfLines={2} style={small}>{latest}</Body> : null}
      </PressableCard>
      <Sheet visible={sheet} title={run.name || copy("Alt ajan ayrıntıları", "Subagent details")} size="full" scroll={false} onClose={() => setSheet(false)}>
        {sheet ? <SubagentDetails block={block} {...props} /> : null}
      </Sheet>
    </>
  );
}
