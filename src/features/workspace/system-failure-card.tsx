import { View } from "react-native";
import AlertCircle from "lucide-react-native/icons/circle-alert";
import { Body } from "@/ui/typography";
import { Badge } from "@/ui/feedback";
import { Disclosure } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { friendlyProviderFailure } from "@/ui/error-message";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";

/** Compact provider/system failure; identical repeats fold into one card with a count. */
export function SystemFailureCard({ text, repeat }: { text: string; repeat?: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const message = friendlyProviderFailure(text, copy);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.row,
        padding: space.md,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.raised,
      }}
    >
      <AlertCircle size={16} color={colors.danger} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <Body selectable style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
          {message}
        </Body>
        {message !== text ? (
          <Disclosure label={copy("Teknik ayrıntılar", "Technical details")}>
            <Body mono selectable>
              {text}
            </Body>
          </Disclosure>
        ) : null}
      </View>
      {repeat && repeat > 1 ? <Badge label={`×${repeat}`} tone="danger" /> : null}
    </View>
  );
}
