import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { Platform } from "react-native";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { IconButton } from "./buttons";

/** Native stack headers draw an arrow on Android and a chevron on iOS and web. */
const BackGlyph = Platform.OS === "android" ? ArrowLeft : ChevronLeft;

/**
 * The one back presentation for stack headers (root `headerLeft`) and in-screen
 * headings. The shared ghost icon button (PanelUI Button) keeps a 48dp target
 * so entry, pairing and stack screens place the chevron at the same position.
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
    <IconButton label={text} disabled={disabled} reserveTouchTarget onPress={onPress}>
      <BackGlyph size={24} strokeWidth={Platform.OS === "android" ? 2 : 2.2} color={colors.text} />
    </IconButton>
  );
}
