import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { Platform, Pressable } from "react-native";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { metrics, opacity } from "./tokens";

/** Native stack headers draw an arrow on Android and a chevron on iOS and web. */
const BackGlyph = Platform.OS === "android" ? ArrowLeft : ChevronLeft;

/**
 * The one back presentation for stack headers (root `headerLeft`) and in-screen
 * headings. The glyph is 24 inside a 48dp target so entry, pairing and stack
 * screens place the chevron at the same position and title offset.
 */
export function HeaderBackButton({ label, onPress, disabled }: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const text = label ?? copy("Geri", "Back");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: !!disabled }}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: metrics.iconTarget,
        height: metrics.iconTarget,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
      })}
    >
      <BackGlyph size={24} strokeWidth={Platform.OS === "android" ? 2 : 2.2} color={colors.text} />
    </Pressable>
  );
}
