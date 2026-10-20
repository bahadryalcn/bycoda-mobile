import { FlatList } from "react-native";
import { Sheet } from "@/ui/primitives";
import { ChatSummary, ChatToolbarAction } from "@/ui/chat-controls";
import Terminal from "lucide-react-native/icons/terminal";
import { colors } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { activityState, activityTitle } from "./transcript-model";
import { TranscriptBlock } from "./transcript-block";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";

export type ActivityInspection = { ids: string[]; selectedId?: string; author?: string };

/** Owned by the transcript so completing a live action cannot dismiss its inspector. */
export function ActivityInspector({ blocks, inspection, onChange, live, ...props }: Omit<TranscriptBlockProps, "block"> & {
  blocks: Block[];
  live: boolean;
  inspection: ActivityInspection;
  onChange: (value: ActivityInspection | null) => void;
}) {
  const copy = useCopy();
  const selected = blocks.find((block) => block.id === inspection.selectedId);
  const index = selected ? blocks.indexOf(selected) : -1;
  const stateLabel = (block: Block) => {
    const state = activityState(block);
    return state === "failed" ? copy("Başarısız", "Failed")
      : state === "stopped" ? copy("Durduruldu", "Interrupted")
        : state === "completed" ? copy("Tamamlandı", "Completed")
          : state === "running" && live ? copy("Çalışıyor", "Running")
            : copy("İşlem kaydı", "Action record");
  };
  return <Sheet visible title={selected
    ? copy("İşlem {p0} / {p1}", "Action {p0} / {p1}", { p0: index + 1, p1: blocks.length })
    : copy("Çalışma ayrıntıları", "Work details")}
    size="full" scroll={!!selected} onClose={() => onChange(null)}
    headerAction={selected ? <ChatToolbarAction label={copy("İşlem listesi", "Action list")}
      onPress={() => onChange({ ...inspection, selectedId: undefined })} /> : undefined}>
    {selected ? <TranscriptBlock key={selected.id} block={selected} {...props} activityDetail />
      : <FlatList data={blocks} keyExtractor={(block) => block.id} style={{ flex: 1 }}
        initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
        renderItem={({ item, index: position }) => <ChatSummary
          label={`${position + 1}. ${activityTitle(item) || copy("Araç işlemi", "Tool action")}`}
          detail={stateLabel(item)}
          icon={<Terminal size={14} color={activityState(item) === "failed" ? colors.danger : colors.muted} />}
          onPress={() => onChange({ ...inspection, selectedId: item.id })} />} />}
  </Sheet>;
}
