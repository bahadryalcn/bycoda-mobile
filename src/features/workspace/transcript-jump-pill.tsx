import Animated from "react-native-reanimated";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import { Fab } from "panelui-native/components/fab";
import { reveal } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

/** Floating "back to latest" pill. It exists only while the list is not following the end. */
export function TranscriptJumpPill({
  unseen,
  bottom,
  onPress,
}: {
  /** New content arrived while the user was reading earlier messages. */
  unseen: boolean;
  /** Space reserved at the bottom (composer and keyboard); the pill floats above it. */
  bottom: number;
  onPress: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = unseen
    ? copy("Yeni mesajlar, son mesaja git", "New messages, jump to latest")
    : copy("Son mesaja git", "Jump to latest");
  return (
    <Animated.View
      entering={reveal}
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: bottom + space.sm, alignItems: "center" }}
    >
      <Fab
        size="sm"
        variant="surface"
        extended={unseen}
        className="h-12 min-w-12"
        accessibilityLabel={label}
        onPress={onPress}
        icon={<ArrowDown size={14} color={unseen ? colors.accent : colors.text} />}
      >
        {unseen ? copy("Yeni", "New") : undefined}
      </Fab>
    </Animated.View>
  );
}
