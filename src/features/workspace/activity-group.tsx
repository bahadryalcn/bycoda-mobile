import { useMobileTheme } from "@/ui/theme";
import { memo } from "react";
import { ChatActivity } from "@/ui/chat-activity";
import { useCopy } from "@/ui/copy";
import { activityState, activitySummary } from "./transcript-model";
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
  useMobileTheme();
  const copy = useCopy();
  const summary = activitySummary(blocks);
  const running = live && summary.running;
  const failed = blocks.some((block) => activityState(block) === "failed");
  const reasoning = blocks.every((block) => block.role === "reasoning");
  const label = reasoning ? copy("Düşünce", "Reasoning") : copy("{p0} işlem", "{p0} actions", { p0: summary.count });
  const title = copy("Çalışma ayrıntıları", "Work details");
  return (
    <ChatActivity
      title={running && failed ? `${label} · ${copy("Çalışıyor", "Running")}` : label}
      reasoning={reasoning}
      detail={summary.title || title}
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
      onInspect={() => onInspect()}
    />
  );
});
