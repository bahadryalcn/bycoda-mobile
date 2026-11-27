import { memo } from "react";
import Terminal from "lucide-react-native/icons/terminal";
import { ChatActivity } from "@/ui/chat-activity";
import { NavigationRow, RowIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useChatDisplay } from "@/ui/chat-display";
import { activityState, activitySummary } from "./transcript-model";
import { toolKind, workOrbState, workSteps, workSummaryLine } from "./work-summary";
import { workedForLabel } from "./transcript-format";
import type { Block } from "./wire";

/** Lines a step added and removed, from the provider's completed per-file edits. */
export function stepDelta(block: Block | undefined): { added: number; removed: number } | undefined {
  const changes = block?.tool?.fileChanges;
  if (!changes?.length) return undefined;
  let added = 0;
  let removed = 0;
  let counted = false;
  for (const change of changes) {
    if (!change.counts) continue;
    counted = true;
    added += change.counts.additions;
    removed += change.counts.deletions;
  }
  return counted ? { added, removed } : undefined;
}

export const ActivityGroup = memo(function ActivityGroup({
  blocks,
  live = true,
  turn,
  onInspect,
}: {
  blocks: Block[];
  live?: boolean;
  /** A settled turn's folded work: the row reads "Worked for 46 s" like desktop's fold line. */
  turn?: Block;
  onInspect: (blockId?: string) => void;
}) {
  const copy = useCopy();
  const zen = useChatDisplay((state) => state.toolVisibility === "zen");
  const summary = activitySummary(blocks);
  const running = live && summary.running;
  const failed = blocks.some((block) => activityState(block) === "failed");
  const reasoning = blocks.every((block) => block.role === "reasoning");
  // Desktop's fold line: what the work added up to ("Read 3 files · Ran a command").
  const label = workSummaryLine(blocks, copy, running);
  const title = copy("Çalışma ayrıntıları", "Work details");
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const steps = workSteps(blocks, copy, running).map((value) => {
    const delta = stepDelta(byId.get(value.id));
    return delta ? { ...value, delta } : value;
  });
  // Desktop's fold line: a settled turn's work is one "Worked for 46 s ›"; what it did opens below.
  const fold = !running && turn?.durationMs != null;
  const [step] = steps;
  if (running && !zen && blocks.length === 1 && step?.code && toolKind(blocks[0]!) === "run")
    return <NavigationRow
      icon={<RowIcon glyph={Terminal} />}
      label={label}
      detail={step.code}
      detailLines={3}
      detailSelectable={false}
      onPress={() => onInspect(step.id)}
    />;
  return (
    <ChatActivity
      title={fold ? workedForLabel(turn?.durationMs, copy) : running && failed ? `${label} · ${copy("Çalışıyor", "Working")}` : label}
      reasoning={reasoning && !fold}
      detail={fold ? label : summary.title || title}
      steps={steps}
      // The work in flight is what the reader watches; settled turns stay folded.
      // Zen keeps the live row compact: one line that opens only on tap.
      defaultOpen={running && !zen}
      busy={workOrbState(blocks)}
      status={
        failed
          ? "error"
          : running
            ? "running"
            : summary.state === "stopped"
              ? "stopped"
              : summary.state === "completed"
                ? "complete"
                : "record"
      }
      onInspect={onInspect}
    />
  );
});
