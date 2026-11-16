import { PressableCard, SectionHeader } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { SessionShelfId, SessionShelfRow } from "./session-collection";

/** Collapsible shelf title: "Needs you", "Running", "Recent" or "Archived". */
export function SessionShelfHeader({
  row,
  onToggle,
}: {
  row: Extract<SessionShelfRow, { kind: "header" }>;
  onToggle: (shelf: SessionShelfId) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const title = {
    pinned: copy("Sabit", "Pinned"),
    needs: copy("Senin için", "Needs you"),
    running: copy("Çalışıyor", "Working"),
    recent: copy("Son", "Recent"),
    snoozed: copy("Ertelenmiş", "Snoozed"),
    settled: copy("Rafta", "Settled"),
    archived: copy("Arşiv", "Archived"),
  }[row.shelf];
  return (
    <PressableCard
      label={`${title}. ${row.count}`}
      expanded={row.expanded}
      onPress={() => onToggle(row.shelf)}
      style={{ minHeight: 0, paddingVertical: 0 }}
    >
      <SectionHeader
        title={title}
        count={row.count}
        trailing={<DisclosureChevron expanded={row.expanded} color={colors.muted} />}
      />
    </PressableCard>
  );
}
