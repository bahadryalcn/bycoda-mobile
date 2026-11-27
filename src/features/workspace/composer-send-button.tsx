import { useRef, useState } from "react";
import { View, type HostInstance } from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import ListPlus from "lucide-react-native/icons/list-plus";
import { ChatCircleAction } from "@/ui/chat-controls";
import { AnchoredMenu, type AnchoredMenuItem } from "@/ui/anchored-menu";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { useMobileTheme } from "@/ui/theme";
import type { ComposerDelivery } from "./composer-delivery";

type BusyMode = "steer" | "queue";

/**
 * The send action. Tap performs the current mode; while a run is active its glyph shows that
 * default (steer or queue). Long-press (or the matching accessibility action) opens a small menu
 * anchored above the button with Steer now and Queue, the default checked; the choice applies to
 * this message only and the Settings default stays. The menu is an in-window layer, so the keyboard
 * stays open. Without a deliverable alternative there is no long-press: holding just sends.
 */
export function ComposerSendButton({
  mode,
  alternate,
  disabled,
  busy,
  onSend,
}: {
  mode: ComposerDelivery;
  /** The other busy mode, only when it can be delivered now. */
  alternate: BusyMode | null;
  disabled: boolean;
  busy: boolean;
  onSend: (mode?: ComposerDelivery) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const anchor = useRef<HostInstance>(null);
  const [choosing, setChoosing] = useState(false);
  const names: Record<BusyMode, string> = { steer: copy("Yönlendir", "Steer"), queue: copy("Sıraya al", "Queue") };
  const label = mode === "send" ? copy("Gönder", "Send") : names[mode];
  const color = disabled ? colors.muted : colors.primaryText;
  const Icon = mode === "steer" ? CornerDownRight : mode === "queue" ? ListPlus : ArrowUp;
  // The choice exists only while both busy modes can be delivered; it closes when the run ends.
  const choice = mode !== "send" && alternate ? alternate : null;
  const available = !!choice && !disabled && !busy;
  // A choice retired by the run ending (or by the draft becoming unsendable) never reopens by itself.
  if (!available && choosing) setChoosing(false);
  const chooseLabel = copy("Gönderme şeklini seç", "Choose how to send");
  const options: AnchoredMenuItem[] = available ? (["steer", "queue"] as const).map((target) => ({
    key: target,
    label: target === "steer" ? copy("Şimdi yönlendir", "Steer now") : copy("Sıraya ekle", "Queue"),
    detail: target === "steer"
      ? copy("Ajanın yaptığını keser", "Interrupts what the agent is doing")
      : copy("Mevcut tur bitince çalışır", "Runs after the current turn"),
    icon: target === "steer" ? <CornerDownRight /> : <ListPlus />,
    selected: target === mode,
    onPress: () => onSend(target),
  })) : [];
  return (
    <View ref={anchor} collapsable={false}>
      <ChatCircleAction
        label={label}
        hint={available ? copy("Basılı tutarak Şimdi yönlendir veya Sıraya ekle arasında seç.", "Press and hold to choose Steer now or Queue.") : undefined}
        active={!disabled}
        disabled={disabled}
        busy={busy}
        onPress={() => {
          if (disabled || busy) return;
          onSend();
        }}
        // A long press that opened the menu never also sends on release (Pressable skips onPress).
        onLongPress={available ? () => {
          haptic.select();
          setChoosing(true);
        } : undefined}
        longPressLabel={available ? chooseLabel : undefined}
      >
        <Icon size={18} strokeWidth={2.6} color={color} />
      </ChatCircleAction>
      <AnchoredMenu
        open={choosing && available}
        anchor={anchor}
        label={chooseLabel}
        items={options}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}
