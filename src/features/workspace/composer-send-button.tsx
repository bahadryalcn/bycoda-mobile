import ArrowUp from "lucide-react-native/icons/arrow-up";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import ListPlus from "lucide-react-native/icons/list-plus";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { showToast } from "@/ui/toast";
import { useMobileTheme } from "@/ui/theme";
import type { ComposerDelivery } from "./composer-delivery";

type BusyMode = "steer" | "queue";

/**
 * The send action. Tap performs the current mode; while a run is active, long-press (or the
 * "alternate" accessibility action) performs the other of Steer/Queue.
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
  const names: Record<BusyMode, string> = { steer: copy("YÃ¶nlendir", "Steer"), queue: copy("SÄ±raya al", "Queue") };
  const label = mode === "send" ? copy("GÃ¶nder", "Send") : names[mode];
  const color = disabled ? colors.muted : colors.primaryText;
  const Icon = mode === "steer" ? CornerDownRight : mode === "queue" ? ListPlus : ArrowUp;
  const alternateName = alternate ? names[alternate] : "";
  return (
    <ChatCircleAction
      label={label}
      hint={alternate ? copy("Basýlý tut: {p0}", "Press and hold for {p0}", { p0: alternateName }) : undefined}
      active={!disabled}
      disabled={disabled}
      busy={busy}
      onPress={() => onSend()}
      onLongPress={alternate ? () => {
        haptic.select();
        onSend(alternate);
        showToast({
          tone: "neutral",
          message: copy("{p0} olarak gönderildi. Dokunma {p1} olarak gönderir.", "Sent as {p0}. Tapping sends as {p1}.", { p0: alternateName, p1: label }),
        });
      } : undefined}
      longPressLabel={alternate ? alternateName : undefined}
    >
      <Icon size={18} strokeWidth={2.6} color={color} />
    </ChatCircleAction>
  );
}
