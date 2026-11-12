import { memo } from "react";
import { View } from "react-native";
import { metrics, space } from "@/ui/tokens";
import { ActivityGroup } from "./activity-group";
import { TranscriptBlock } from "./transcript-block";
import { isSystemFailure, type TranscriptEntry } from "./transcript-model";
import { SystemFailureCard } from "./system-failure-card";
import type { SessionCommand, SessionScope } from "./session-types";
import type { HostSession } from "./wire";
import { useMobileTheme } from "@/ui/theme";

/** Collapsed activity rows are a fixed single line, so the list never measures them. */
export const ACTIVITY_ROW_HEIGHT = metrics.toolRowHeight + space.xxs;

export function transcriptItemSize(item: TranscriptEntry) {
  return item.kind === "activity" ? ACTIVITY_ROW_HEIGHT : undefined;
}

export type TranscriptRowProps = {
  item: TranscriptEntry;
  highlighted: boolean;
  /** Only activity rows depend on the running flag; message rows receive false. */
  live: boolean;
  /** Stable getter for the latest session revision, read at block fetch time. */
  getRevision: () => number | undefined;
  parentProvider?: HostSession["session"]["harness"];
  context?: import("@/ui/media-policy").MessageContext;
  responseText: (id: string) => string | undefined;
  scope: SessionScope;
  runId?: string;
  disabled: boolean;
  onCommand: SessionCommand;
  onInspect: (item: Extract<TranscriptEntry, { kind: "activity" }>, selectedId?: string) => void;
};

/**
 * Every prop is a primitive or a stable reference, so a row re-renders only when its own
 * entry changes (or the highlight, run, or block-detail revision it truly depends on).
 */
export const TranscriptRow = memo(function TranscriptRow({
  item,
  highlighted,
  live,
  getRevision,
  parentProvider,
  context,
  responseText,
  scope,
  runId,
  disabled,
  onCommand,
  onInspect,
}: TranscriptRowProps) {
  const { colors } = useMobileTheme();
  if (item.kind === "activity")
    return (
      <View
        style={{
          height: ACTIVITY_ROW_HEIGHT,
          paddingBottom: space.xxs,
          backgroundColor: highlighted ? colors.selected : undefined,
        }}
      >
        <ActivityGroup
          live={live}
          blocks={item.blocks}
          onInspect={(selectedId) => onInspect(item, selectedId)}
        />
      </View>
    );
  return (
    <View
      style={{
        paddingBottom: space.row,
        backgroundColor: highlighted ? colors.selected : undefined,
      }}
    >
      {isSystemFailure(item.block) && item.block.text ? <SystemFailureCard text={item.block.text} repeat={item.repeat} /> : <TranscriptBlock
        parentProvider={parentProvider}
        context={context}
        responseText={responseText}
        block={item.block}
        author={item.author}
        scope={scope}
        getRevision={getRevision}
        runId={runId}
        disabled={disabled}
        onCommand={onCommand}
      />}
    </View>
  );
});
