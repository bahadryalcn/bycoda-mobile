import { View } from "react-native";
import AlertCircle from "lucide-react-native/icons/circle-alert";
import { Body } from "@/ui/typography";
import { Badge } from "@/ui/feedback";
import { useCopy } from "@/ui/copy";
import { friendlyProviderFailure } from "@/ui/error-message";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";

/** Compact provider/system failure; identical repeats fold into one card with a count. */
export function SystemFailureCard({ text, repeat }: { text: string; repeat?: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: space.row, padding: space.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.raised }}
    >
      <AlertCircle size={16} color={colors.danger} style={{ marginTop: 2 }} />
      <Body numberOfLines={4} selectable style={{ flex: 1, minWidth: 0, fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
        {friendlyProviderFailure(text, copy)}
      </Body>
      {repeat && repeat > 1 ? <Badge label={`×${repeat}`} tone="danger" /> : null}
    </View>
  );
}
