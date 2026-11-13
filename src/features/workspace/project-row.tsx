import { memo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitBranch from "lucide-react-native/icons/git-branch";
import Info from "lucide-react-native/icons/info";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { ProjectIcon } from "@/ui/project-icon";
import { PressableCard, StatusText } from "@/ui/primitives";
import { SwipeActions, type SwipeRowAction } from "@/ui/swipe-actions";
import { gapIcon, metrics, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { HostProject } from "@/domain/types";
import { relativeTime } from "./shared";

export type ProjectRowView = "files" | "git";

/** Compact project row: icon and name, one quiet status on the right. Paths live in the details sheet. */
export const ProjectRow = memo(function ProjectRow({
  id,
  name,
  appearance,
  depth,
  grouped,
  registered,
  running,
  activeAt,
  opening,
  disabled,
  onPress,
  onDetails,
  onOpenView,
}: {
  id: string;
  name: string;
  appearance?: HostProject["appearance"];
  /** Workspace nesting below another project. */
  depth: number;
  /** Indented under a group header with a guide line. */
  grouped: boolean;
  registered: boolean;
  running: number;
  activeAt?: number;
  opening: boolean;
  disabled: boolean;
  /** Receive the project id so the parent can pass one stable callback to every row. */
  onPress: (id: string) => void;
  onDetails: (id: string) => void;
  onOpenView: (id: string, view: ProjectRowView) => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const copy = useCopy();
  const runningLabel = copy("{p0} çalışıyor", "{p0} running", { p0: running });
  const openingLabel = copy("Açılıyor…", "Opening…");
  const since = relativeTime(activeAt, copy);
  const actions: SwipeRowAction[] = [
    {
      key: "details",
      label: copy("Ayrıntılar", "Details"),
      icon: <Info size={18} strokeWidth={2} />,
      onPress: () => onDetails(id),
    },
    ...(registered
      ? [
          { key: "files", label: copy("Dosyalar", "Files"), icon: <FolderTree size={18} strokeWidth={2} />, onPress: () => onOpenView(id, "files") },
          { key: "git", label: copy("Değişiklikler", "Changes"), icon: <GitBranch size={18} strokeWidth={2} />, onPress: () => onOpenView(id, "git") },
        ]
      : []),
  ];
  const row = (
    <PressableCard
      label={[name, opening ? openingLabel : running ? runningLabel : "", since].filter(Boolean).join(". ")}
      disabled={disabled && !opening}
      onPress={() => onPress(id)}
      onLongPress={() => onDetails(id)}
      optionsLabel={copy("Proje ayrıntıları", "Project details")}
      style={{
        minHeight: Math.max(metrics.touchTarget, metrics.rowHeightProject - space.sm),
        flexDirection: "row",
        alignItems: "center",
        gap: gapIcon,
        paddingVertical: space.xs,
        paddingStart: space.xs + depth * space.lg,
      }}
    >
      {depth > 0 ? <CornerDownRight size={13} color={colors.tertiary} /> : null}
      <ProjectIcon appearance={appearance} size={depth > 0 ? 18 : 22} box={depth > 0 ? 22 : 28} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      <Text numberOfLines={1} style={[uiStyles.label, { flexGrow: 1, flexShrink: 1, flexBasis: 140 * Math.max(1, fontScale), minWidth: 0 }]}>{name}</Text>
      {opening ? <StatusText label={openingLabel} tone="info" />
        : running ? <StatusText label={runningLabel} tone="live" />
        : since ? <Text style={[uiStyles.caption, { flexShrink: 1 }]}>{since}</Text> : null}
      </View>
    </PressableCard>
  );
  const swipeable = <SwipeActions actions={actions} disabled={disabled}>{row}</SwipeActions>;
  if (!grouped) return swipeable;
  return (
    <View style={{ marginStart: space.md, paddingStart: space.xs, borderStartWidth: metrics.groupGuide, borderStartColor: colors.separator }}>
      {swipeable}
    </View>
  );
});

/** Collapsible group header: a filled band with group icon, bold name and a count pill. */
export function ProjectGroupHeader({
  name,
  appearance,
  count,
  running,
  expanded,
  collapsible,
  first,
  onToggle,
}: {
  name: string;
  appearance?: HostProject["appearance"];
  count: number;
  running: number;
  expanded: boolean;
  collapsible: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const runningLabel = copy("{p0} çalışıyor", "{p0} running", { p0: running });
  const content = (
    <>
      <ProjectIcon appearance={appearance} group size={18} box={24} />
      <Text numberOfLines={1} style={[uiStyles.label, { flex: 1, minWidth: 0, fontWeight: "700" }]}>{name}</Text>
      {running ? <StatusText label={runningLabel} tone="live" /> : null}
      <View style={{ minWidth: metrics.countPill, paddingHorizontal: space.sm, borderRadius: radii.pill, backgroundColor: colors.fill, alignItems: "center" }}>
        <Text style={[uiStyles.caption, { fontVariant: ["tabular-nums"] }]}>{count}</Text>
      </View>
      {collapsible ? <DisclosureChevron expanded={expanded} color={colors.muted} size={16} /> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: gapIcon,
    minHeight: metrics.rowHeightProject - space.xs,
    paddingHorizontal: space.row,
    marginTop: first ? 0 : space.md,
    // Filled band aligns to the page gutter like the search field (unfilled rows may bleed, filled ones may not).
    marginHorizontal: 0,
    borderRadius: radii.control,
    backgroundColor: colors.raised,
  };
  if (!collapsible)
    return <View accessibilityRole="header" style={style}>{content}</View>;
  return (
    <PressableCard
      label={`${name}. ${count}${running ? `. ${runningLabel}` : ""}`}
      expanded={expanded}
      onPress={onToggle}
      style={style}
    >
      {content}
    </PressableCard>
  );
}
