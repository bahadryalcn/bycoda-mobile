import { Text, View } from "react-native";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { radii } from "./tokens";
import type { UnsavedBadgeProps } from "./component-props";

/** Compact dirty indicator: warning dot and 13 muted label. Presentational; the editor owns dirtiness. */
export function UnsavedBadge({ label }: UnsavedBadgeProps) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const text = label ?? copy("Değişiklikler kaydedilmedi", "Unsaved changes");
  return (
    <View accessible accessibilityLabel={text} accessibilityRole="text" style={uiStyles.unsaved}>
      <View accessible={false} style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: semanticColors.warning.text }} />
      <Text style={[uiStyles.unsavedText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}
