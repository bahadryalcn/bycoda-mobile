import UserRound from "lucide-react-native/icons/user-round";
import Briefcase from "lucide-react-native/icons/briefcase";
import { Body, Row } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";

export type AccountKindMetadata = { kind?: "personal" | "work"; derivedKind?: "personal" | "work" };
export function ProviderAccountKind({ kind, derivedKind }: AccountKindMetadata) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const effective = kind ?? derivedKind;
  if (!effective) return null;
  const Icon = effective === "work" ? Briefcase : UserRound;
  return (
    <Row>
      <Icon size={14} color={colors.muted} />
      <Body muted>{effective === "work" ? copy("İş", "Work") : copy("Kişisel", "Personal")}</Body>
    </Row>
  );
}
