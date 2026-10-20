import { useState } from "react";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Check from "lucide-react-native/icons/check";
import { NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import type { TranscriptView } from "./transcript-model";

/** Local display selection never changes the session, composer or host permissions. */
export function TranscriptViewFilter({ value, onChange }: {
  value: TranscriptView;
  onChange: (value: TranscriptView) => void;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const options: { value: TranscriptView; label: string; detail: string }[] = [
    { value: "messages", label: copy("Mesajlar", "Messages"), detail: copy(
      "Mesajlar ve sonuçlar. İşlemler yalnızca çalışırken görünür.",
      "Messages and results. Actions appear only while running.",
    ) },
    { value: "details", label: copy("Ayrıntılı", "Detailed"), detail: copy(
      "Tam işlem geçmişi, düşünceler ve araç çıktıları.",
      "Full action history, reasoning and tool outputs.",
    ) },
  ];
  return <>
    <ChatToolbarAction label={options.find((option) => option.value === value)!.label}
      accessibilityLabel={`${copy("Sohbet görünümü", "Chat view")}: ${options.find((option) => option.value === value)!.label}`}
      tone={value === "details" ? "accent" : "muted"} onPress={() => setOpen(true)}>
      <SlidersHorizontal size={14} color={value === "details" ? colors.accent : colors.muted} />
    </ChatToolbarAction>
    <Sheet visible={open} title={copy("Sohbet görünümü", "Chat view")} size="compact" onClose={() => setOpen(false)}>
      <NavigationGroup>
        {options.map((option) => <NavigationRow key={option.value} label={option.label}
          detail={option.detail} detailLines={0} detailSelectable={false}
          trailing={value === option.value ? <Check size={20} color={colors.accent} /> : undefined}
          onPress={() => { onChange(option.value); setOpen(false); }} />)}
      </NavigationGroup>
    </Sheet>
  </>;
}
