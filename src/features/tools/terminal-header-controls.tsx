import { View } from "react-native";
import Copy from "lucide-react-native/icons/copy";
import Check from "lucide-react-native/icons/check";
import { IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";
import type { useClipboardFeedback } from "@/ui/use-clipboard-feedback";

export function TerminalStatusDot({ running }: { running: boolean }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  return <View accessible accessibilityLabel={running ? copy("Çalışıyor", "Running") : copy("Durduruldu", "Stopped")}
    style={{ width: space.sm, height: space.sm, borderRadius: radii.pill,
      backgroundColor: running ? colors.success : colors.muted }} />;
}

export function TerminalCopyButton({ clipboard, disabled }: {
  clipboard: ReturnType<typeof useClipboardFeedback>; disabled?: boolean;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  return <IconButton label={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Çıktıyı kopyala", "Copy output")}
    reserveTouchTarget disabled={disabled} busy={clipboard.busy} onPress={clipboard.copy}>
    {clipboard.copied ? <Check size={iconSize.action} color={colors.success} /> : <Copy size={iconSize.action} color={colors.muted} />}
  </IconButton>;
}
