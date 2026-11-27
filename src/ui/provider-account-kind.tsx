import UserRound from "lucide-react-native/icons/user-round";
import Briefcase from "lucide-react-native/icons/briefcase";
import { View } from "react-native";
import { Body, Row } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";

/** Personal or work account. `iconOnly` keeps just the glyph, which still speaks its kind. */
export function ProviderAccountKind({ kind = "personal", iconOnly = false, color }: {
  kind?: "personal" | "work";
  iconOnly?: boolean;
  /** Glyph colour where the glyph sits on a coloured surface (inside a meter fill). */
  color?: string;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const Icon = kind === "work" ? Briefcase : UserRound;
  const label = kind === "work" ? copy("İş", "Work") : copy("Kişisel", "Personal");
  if (iconOnly) return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Icon size={14} strokeWidth={2} color={color ?? colors.muted} />
    </View>
  );
  return (
    <Row>
      <Icon size={14} color={colors.muted} />
      <Body muted>{label}</Body>
    </Row>
  );
}
