import { memo } from "react";
import Terminal from "lucide-react-native/icons/terminal";
import { ChatActivity } from "@/ui/chat-activity";
import { NavigationRow, RowIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useChatDisplay } from "@/ui/chat-display";
import { activityState, activitySummary } from "./transcript-model";
import { toolKind, workOrbState, workSteps, workSummaryLine } from "./work-summary";
import type { Block } from "./wire";

export const ActivityGroup = memo(function ActivityGroup({
  blocks,
  live = true,
  onInspect,
}: {
  blocks: Block[];
  live?: boolean;
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
  const steps = workSteps(blocks, copy, running);
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
      title={running && failed ? `${label} · ${copy("Çalışıyor", "Working")}` : label}
      reasoning={reasoning}
      detail={summary.title || title}
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
