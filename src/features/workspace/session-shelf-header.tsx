import { View } from "react-native";
import { Body, PressableCard, SectionHeader } from "@/ui/primitives";
import { ProjectIcon } from "@/ui/project-icon";
import { ActivityBars } from "@/ui/activity-bars";
import { WorkingRowGlow } from "@/ui/working-row-glow";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { hitSlopFor, metrics, space } from "@/ui/tokens";
import type { SessionShelfId, SessionShelfRow } from "./session-collection";
import type { ProjectGroupHeader } from "./global-session-shelves";

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
    pinned: copy("Sabitlenenler", "Pinned"),
    needs: copy("Seni bekliyor", "Needs you"),
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
      hitSlop={hitSlopFor(metrics.sectionHeaderHeight)}
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

/**
 * A project section of the grouped Sessions view: the project's identity, its session count and
 * the fold mark. It reads as a group title (label weight, no status color) above its rows. A group
 * with a run in flight carries the activity bars beside its identity, so a folded group still says
 * work is happening inside it.
 */
export function SessionProjectHeader({ row, onToggle }: {
  row: ProjectGroupHeader;
  onToggle: (key: ProjectGroupHeader["key"]) => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const runningLabel = row.running ? copy("{p0} çalışıyor", "{p0} running", { p0: row.running }) : undefined;
  return (
    <View style={{ marginTop: space.sm }}>
    {/* Like desktop, a folded group carries the working-row decoration for the runs inside it. */}
    {row.running && !row.expanded ? <WorkingRowGlow /> : null}
    <PressableCard
      label={[row.project.name, String(row.count), runningLabel].filter(Boolean).join(". ")}
      expanded={row.expanded}
      onPress={() => onToggle(row.key)}
      style={{ minHeight: metrics.touchTarget, paddingVertical: space.xs }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.row }}>
        <ProjectIcon appearance={row.project.appearance} size={16} box={20} />
        {row.running ? <ActivityBars /> : null}
        <Body selectable={false} style={[uiStyles.label, { flex: 1, minWidth: 0, fontWeight: "600" }]}>
          {row.project.name}
        </Body>
        <Body selectable={false} muted style={uiStyles.caption}>{String(row.count)}</Body>
        <DisclosureChevron expanded={row.expanded} color={colors.muted} />
      </View>
    </PressableCard>
    </View>
  );
}
