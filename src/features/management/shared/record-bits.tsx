import type { LucideIcon } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Row } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { inboxRelativeTime } from "../inbox-time";

/** One aligned trailing cluster for a record's open/run command and its "…" menu. */
export function RecordTrailing({ children }: PropsWithChildren) {
  return <Row style={{ gap: 0, flexWrap: "nowrap", alignItems: "flex-start" }}>{children}</Row>;
}

/** Icon factory for ActionMenu items; destructive actions pass the danger tone. */
export function useMenuGlyph() {
  const { colors } = useMobileTheme();
  return (Icon: LucideIcon, danger = false) => <Icon size={18} color={danger ? colors.danger : colors.muted} />;
}

/** Relative time ("5 min", "yesterday") for a past or future instant; empty when unknown. */
export function useRelativeTime() {
  const copy = useCopy();
  const locale = useLocale();
  return (value?: number) => (value ? inboxRelativeTime(value, locale, copy) : "");
}

/** Metadata line parts joined the way every record card shows them. */
export const joinMeta = (parts: readonly (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");
