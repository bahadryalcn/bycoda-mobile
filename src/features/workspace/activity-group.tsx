import { useMobileTheme } from "@/ui/theme";
import { memo, useState } from "react";
import { View } from "react-native";
import Terminal from "lucide-react-native/icons/terminal";
import { Body, Sheet } from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { uiStyles } from "@/ui/styles";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { TranscriptBlock } from "./transcript-block";
import { activitySummary } from "./transcript-model";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";

export const ActivityGroup = memo(function ActivityGroup({
  blocks,
  ...props
}: Omit<TranscriptBlockProps, "block"> & { blocks: Block[] }) {
  useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const summary = activitySummary(blocks);
  const title = copy("Çalışma ayrıntıları", "Work details");
  const status = summary.running
    ? copy("Çalışıyor", "Running")
    : summary.completed
      ? copy("Tamamlandı", "Completed")
      : undefined;
  return (
    <>
      <ChatSummary
        label={summary.title || title}
        detail={copy("{p0} işlem · ayrıntıları aç", "{p0} actions · open details", {
          p0: summary.count,
        })}
        status={status}
        color={summary.running ? colors.live : colors.muted}
        icon={<Terminal size={16} color={summary.running ? colors.live : colors.muted} />}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={title} size="full" onClose={() => setOpen(false)}>
        {open ? (
          <View style={{ gap: space.lg }}>
            <Body muted style={uiStyles.caption}>
              {copy("{p0} işlem", "{p0} actions", { p0: summary.count })}
              {status ? ` · ${status}` : ""}
            </Body>
            {blocks.map((block) => (
              <TranscriptBlock key={block.id} block={block} {...props} activityDetail />
            ))}
          </View>
        ) : null}
      </Sheet>
    </>
  );
});
