import { FlatList } from "react-native";
import { NavigationRow, RowIcon, Sheet, StateView } from "@/ui/primitives";
import { ChatToolbarAction } from "@/ui/chat-controls";
import Terminal from "lucide-react-native/icons/terminal";
import { useCopy } from "@/ui/copy";
import { activityListTitle, activityState } from "./transcript-model";
import { TranscriptBlock } from "./transcript-block";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";
import { metrics, space } from "@/ui/tokens";

export type ActivityInspection = { ids: string[]; selectedId?: string; author?: string };

/** Owned by the transcript so completing a live action cannot dismiss its inspector. */
export function ActivityInspector({ blocks, inspection, onChange, live, ...props }: Omit<TranscriptBlockProps, "block"> & {
  blocks: Block[];
  live: boolean;
  inspection: ActivityInspection;
  onChange: (value: ActivityInspection | null) => void;
}) {
  const copy = useCopy();
  const available = blocks.filter((block) => !block.internal);
  const index = available.findIndex((block) => block.id === inspection.selectedId);
  const selected = available[index];
  const inspectingAction = inspection.selectedId !== undefined;
  const stateLabel = (block: Block) => {
    const state = activityState(block);
    return state === "failed" ? copy("Başarısız", "Failed")
      : state === "stopped" ? copy("Durduruldu", "Interrupted")
        : state === "completed" ? copy("Tamamlandı", "Completed")
          : state === "running" && live ? copy("Çalışıyor", "Running")
            : copy("İşlem kaydı", "Action record");
  };
  return <Sheet visible title={selected
    ? copy("İşlem {p0} / {p1}", "Action {p0} / {p1}", { p0: index + 1, p1: available.length })
    : copy("Çalışma ayrıntıları", "Work details")}
    size="full" scroll={inspectingAction} onClose={() => onChange(null)}
    headerAction={inspectingAction && available.length > 0 ? <ChatToolbarAction label={copy("İşlem listesi", "Action list")}
      onPress={() => onChange({ ...inspection, selectedId: undefined })} /> : undefined}>
    {selected ? <TranscriptBlock key={selected.id} block={selected} {...props} activityDetail />
      : inspectingAction ? <StateView compact title={copy("İşlem gösterilemiyor", "Action unavailable")} />
      : <FlatList data={available} keyExtractor={(block) => block.id} style={{ flex: 1 }} contentContainerStyle={{ width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center", paddingHorizontal: space.screen }}
        ListEmptyComponent={<StateView compact title={copy("Gösterilecek işlem yok", "No actions to show")} />}
        initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
        renderItem={({ item }) => <NavigationRow
          label={activityListTitle(item) || copy("Araç işlemi", "Tool action")}
          labelLines={2}
          detail={stateLabel(item)}
          icon={<RowIcon glyph={Terminal} tone={activityState(item) === "failed" ? "danger" : undefined} />}
          onPress={() => onChange({ ...inspection, selectedId: item.id })} />} />}
  </Sheet>;
}
