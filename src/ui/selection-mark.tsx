import { View } from "react-native";
import Check from "lucide-react-native/icons/check";
import { useMobileTheme } from "./theme";
import { iconSize, radii } from "./tokens";

/** Visual box of a multiple-choice mark. */
const BOX = 20;

/**
 * The one "selected" mark of a choice row, drawn by the row that owns the press and the
 * checkbox/radio semantics (so the mark itself stays decorative). `multiple` draws a 20 box that fills
 * with the accent and a check when selected (a 1dp muted frame when not); a single choice shows only
 * the 16 accent check. PanelUI Checkbox is not used here: it is its own 48 tall pressable row, and a
 * row cannot nest a second touch target.
 */
export function SelectionMark({ selected, multiple = false }: { selected: boolean; multiple?: boolean }) {
  const { colors } = useMobileTheme();
  if (!multiple) {
    return selected
      ? <Check accessible={false} size={iconSize.check} strokeWidth={2.6} color={colors.accent} style={{ flexShrink: 0 }} />
      : null;
  }
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{
        width: BOX, height: BOX, borderRadius: radii.badge, alignItems: "center", justifyContent: "center", flexShrink: 0,
        ...(selected ? { backgroundColor: colors.accent } : { borderWidth: 1, borderColor: colors.muted }),
      }}>
      {selected ? <Check size={iconSize.check - 2} strokeWidth={3} color={colors.primaryText} /> : null}
    </View>
  );
}
