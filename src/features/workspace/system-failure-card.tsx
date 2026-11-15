import { View } from "react-native";
import AlertCircle from "lucide-react-native/icons/circle-alert";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import { sessionErrorPresentation } from "../../../../src/features/sessions/model/sessionErrorPresentation";
import { Body } from "@/ui/typography";
import { Badge } from "@/ui/feedback";
import { Disclosure } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { friendlyProviderFailure } from "@/ui/error-message";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";

/** Provider limit codes desktop's presentation does not phrase as a sentence. */
const USAGE_LIMIT_CODE =
  /usage_limit_reached|quota_exceeded|insufficient_quota|(?:usage|weekly|monthly|session)\s+limit\s+(?:reached|exceeded)/i;

/**
 * Compact provider/system failure; identical repeats fold into one card with a count. A usage
 * limit is a wait, not a fault, so it reads in warning tone as on desktop.
 */
export function SystemFailureCard({ text, repeat }: { text: string; repeat?: number }) {
  const { colors, semanticColors } = useMobileTheme();
  const copy = useCopy();
  const presentation = sessionErrorPresentation(text);
  const usageLimit = !!presentation.usageLimit || USAGE_LIMIT_CODE.test(text);
  const message = presentation.usageLimit
    ? [copy("Kullanım sınırına ulaşıldı", "Usage limit reached"), presentation.summary?.trim()].filter(Boolean).join(" · ")
    : friendlyProviderFailure(text, copy);
  const tone = usageLimit ? semanticColors.warning : undefined;
  const Icon = usageLimit ? TriangleAlert : AlertCircle;
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
        borderColor: tone?.border ?? colors.danger,
        backgroundColor: tone?.surface ?? colors.raised,
      }}
    >
      <Icon size={16} color={tone?.text ?? colors.danger} style={{ marginTop: 2 }} />
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
      {repeat && repeat > 1 ? <Badge label={`×${repeat}`} tone={usageLimit ? "warning" : "danger"} /> : null}
    </View>
  );
}
