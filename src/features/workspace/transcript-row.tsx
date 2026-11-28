import { memo } from "react";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { ActivityGroup } from "./activity-group";
import { TranscriptBlock } from "./transcript-block";
import { isSystemFailure, type TranscriptEntry } from "./transcript-model";
import { SystemFailureCard } from "./system-failure-card";
import { TranscriptSubagents } from "./transcript-subagents";
import { TranscriptTurnSummary } from "./transcript-turn-summary-view";
import type { TurnChangedFile } from "./transcript-turn-summary";
import { HandoffDivider, ModelSwitchDivider, ModelSwitchRow, TurnFooter } from "./turn-chrome";
import type { SessionCommand, SessionScope } from "./session-types";
import type { Block, HostSession } from "./wire";
import type { RewindAvailability } from "./rewind-availability";
import { useMobileTheme } from "@/ui/theme";

export type TranscriptRowProps = {
  item: TranscriptEntry;
  highlighted: boolean;
  /** Activity, subagent and draft rows depend on the running flag; other message rows receive false. */
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
  /** Agents rows: the run an active find hit is on, and the find request to open it. */
  focusRunId?: string;
  openRunNonce?: number;
  /** Edit from here on this row's user message: offered, disabled with a reason, or absent. The transcript owns the review. */
  rewind?: RewindAvailability;
  /** `full` is the message's whole block when the row holds only the Host's preview. */
  onRewind?: (blockId: string, full?: Block) => void;
  /** Opens the edits of one file a settled turn changed; the transcript owns the inspector. */
  onOpenChangedFile?: (blockIds: string[], author?: string) => void;
};

/** The settled turn's receipt, then its changed files and sources, after the turn's last entry. */
function TurnEnd({ item, cwd, onOpenChangedFile }: { item: TranscriptEntry; cwd?: string; onOpenChangedFile?: TranscriptRowProps["onOpenChangedFile"] }) {
  return (
    <>
      {item.footer ? <TurnFooter turn={item.footer} showDuration={!!item.footerDuration} /> : null}
      {item.turnSummary ? (
        <TranscriptTurnSummary
          summary={item.turnSummary}
          cwd={cwd}
          onOpenFile={onOpenChangedFile ? (file: TurnChangedFile) => onOpenChangedFile(file.blockIds, item.author) : undefined}
        />
      ) : null}
    </>
  );
}

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
  rewind = "none",
  onRewind,
  focusRunId,
  openRunNonce,
  onOpenChangedFile,
}: TranscriptRowProps) {
  const { colors } = useMobileTheme();
  const end = <TurnEnd item={item} cwd={context?.cwd} onOpenChangedFile={onOpenChangedFile} />;
  const ended = !!item.footer || !!item.turnSummary;
  if (item.kind === "agents")
    return (
      <View style={{ paddingBottom: ended ? space.row : space.xxs, backgroundColor: highlighted ? colors.selected : undefined }}>
        <TranscriptSubagents blocks={item.blocks} live={live} parentProvider={parentProvider} context={context} scope={scope}
          getRevision={getRevision} runId={runId} disabled={disabled} onCommand={onCommand}
          focusRunId={focusRunId} openRunNonce={openRunNonce} />
        {end}
      </View>
    );
  if (item.kind === "activity")
    return (
      <View
        style={{
          paddingBottom: ended ? space.row : space.xxs,
          backgroundColor: highlighted ? colors.selected : undefined,
        }}
      >
        <ActivityGroup
          live={live}
          blocks={item.blocks}
          turn={item.foldTurn}
          onInspect={(selectedId) => onInspect(item, selectedId)}
        />
        {end}
      </View>
    );
  return (
    <View
      style={{
        paddingBottom: item.continuation ? space.sm : space.row,
        backgroundColor: highlighted ? colors.selected : undefined,
      }}
    >
      {item.modelChange ? <ModelSwitchDivider
          from={{ harness: item.modelChange.from.harness, model: item.modelChange.from.name }}
          to={{ harness: item.modelChange.to.harness, model: item.modelChange.to.name }}
        /> : null}
      {item.block.modelSwitch ? <ModelSwitchRow meta={item.block.modelSwitch} /> : item.block.role === "handoff" ? <HandoffDivider block={item.block} /> : isSystemFailure(item.block) && item.block.text ? <SystemFailureCard id={item.block.id} text={item.block.text} repeat={item.repeat} /> : <TranscriptBlock
        modelName={item.modelName}
        continuation={item.continuation}
        showAuthor={item.showAuthor}
        onRewind={rewind === "available" && onRewind ? (full) => onRewind(item.block.id, full) : undefined}
        rewindUnavailable={rewind === "update" || rewind === "running" ? rewind : undefined}
        running={live}
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
      {end}
    </View>
  );
});
