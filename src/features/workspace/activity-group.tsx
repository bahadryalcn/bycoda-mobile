import { useMobileTheme } from "@/ui/theme";
import { memo } from "react";
import { ChatActivity } from "@/ui/chat-activity";
import { useCopy } from "@/ui/copy";
import { activitySummary } from "./transcript-model";
import type { Block } from "./wire";

export const ActivityGroup = memo(function ActivityGroup({
  blocks,
  live = true,
  onInspect,
}: { blocks: Block[]; live?: boolean; onInspect: (blockId?: string) => void }) {
  useMobileTheme();
  const copy = useCopy();
  const summary = activitySummary(blocks);
  const running = live && summary.running;
  const title = copy("Çalışma ayrıntıları", "Work details");
  return (
    <ChatActivity
      title={
        blocks.every((block) => block.role === "reasoning")
          ? copy("Düşünce", "Reasoning")
          : copy("{p0} işlem", "{p0} actions", { p0: summary.count })
      }
      reasoning={blocks.every((block) => block.role === "reasoning")}
      detail={summary.title || title}
      status={running ? "running" : summary.completed ? "complete" : "pending"}
      onInspect={() => onInspect()}
    />
  );
});
