import UserRound from "lucide-react-native/icons/user-round";
import Briefcase from "lucide-react-native/icons/briefcase";
import { Body, Row } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";

export function ProviderAccountKind({ kind = "personal" }: { kind?: "personal" | "work" }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const Icon = kind === "work" ? Briefcase : UserRound;
  return (
    <Row>
      <Icon size={14} color={colors.muted} />
      <Body muted>{kind === "work" ? copy("İş", "Work") : copy("Kişisel", "Personal")}</Body>
    </Row>
  );
}
