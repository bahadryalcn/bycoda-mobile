import { memo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import CornerDownRight from "lucide-react-native/icons/corner-down-right";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import SquarePen from "lucide-react-native/icons/square-pen";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { ProjectIcon } from "@/ui/project-icon";
import { Badge, PressableCard, StatusText } from "@/ui/primitives";
import { SwipeActions, type SwipeRowAction } from "@/ui/swipe-actions";
import { gapIcon, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { HostProject } from "@/domain/types";
import { relativeTime } from "./shared";

export type ProjectRowView = "files" | "git";

/**
 * Compact project row: icon and name, one quiet status (opening, needs you, running or last
 * activity). Long-press and the swipe "More" tile open the shared project options sheet; the swipe
 * primary is "New session" for a registered project. Paths live in details unless the person turns
 * on full folder paths; a name another project shares gets its parent folder as a hint.
 */
export const ProjectRow = memo(function ProjectRow({
  id,
  name,
  context,
  path,
  kind,
  appearance,
  depth,
  grouped,
  registered,
  running,
  needsYou = 0,
  activeAt,
  opening,
  disabled,
  onPress,
  onOptions,
  onNewSession,
}: {
  id: string;
  name: string;
  /** Parent folder shown when another project has the same name. */
  context?: string;
  /** Full folder path, shown only when the "Full folder paths" view option is on. */
  path?: string;
  /** Personal/Work tag from the computer's model routing (own or inherited from its group). */
  kind?: "personal" | "work";
  appearance?: HostProject["appearance"];
  /** Workspace nesting below another project. */
  depth: number;
  /** Indented under a group header with a guide line. */
  grouped: boolean;
  registered: boolean;
  running: number;
  /** Sessions waiting for the owner; shown ahead of running. */
  needsYou?: number;
  activeAt?: number;
  opening: boolean;
  disabled: boolean;
  /** Receive the project id so the parent can pass one stable callback to every row. */
  onPress: (id: string) => void;
  /** Opens the project options sheet (long-press, accessibility action, swipe "More"). */
  onOptions: (id: string) => void;
  onNewSession?: (id: string) => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const large = fontScale > 1;
  const copy = useCopy();
  const runningLabel = copy("{p0} çalışıyor", "{p0} running", { p0: running });
  const needsLabel = copy("Senden bekliyor", "Needs you");
  const openingLabel = copy("Açılıyor…", "Opening…");
  const since = relativeTime(activeAt, copy);
  const kindLabel = kind === "work" ? copy("İş", "Work") : kind === "personal" ? copy("Kişisel", "Personal") : "";
  const actions: SwipeRowAction[] = [
    ...(registered && onNewSession
      ? [{ key: "new-session", label: copy("Yeni oturum", "New session"), icon: <SquarePen size={18} strokeWidth={2} />, onPress: () => onNewSession(id) }]
      : []),
    { key: "more", label: copy("Diğer", "More"), icon: <MoreHorizontal size={18} strokeWidth={2} />, onPress: () => onOptions(id) },
  ];
  const status = opening ? <StatusText label={openingLabel} tone="info" />
    : needsYou ? <StatusText label={needsLabel} tone="warning" />
    : running ? <StatusText label={runningLabel} tone="live" />
    : since ? <Text style={[uiStyles.caption, { flexShrink: 1 }]}>{since}</Text> : null;
  const row = (
    <PressableCard
      label={[context ? `${name} (${context})` : name, kindLabel, path, opening ? openingLabel : needsYou ? needsLabel : running ? runningLabel : "", since].filter(Boolean).join(". ")}
      disabled={disabled && !opening}
      onPress={() => onPress(id)}
      onLongPress={() => onOptions(id)}
      optionsLabel={copy("Proje seçenekleri", "Project options")}
      style={{
        // The shared list-row metrics: 52 high with the row's vertical padding.
        minHeight: metrics.rowHeightProject,
        flexDirection: "row",
        alignItems: large ? "flex-start" : "center",
        gap: gapIcon,
        paddingVertical: space.row,
        paddingStart: space.xs + depth * space.lg,
      }}
    >
      {depth > 0 ? <CornerDownRight size={13 * Math.min(fontScale, 1.6)} color={colors.tertiary} /> : null}
      <ProjectIcon appearance={appearance} size={depth > 0 ? 18 : 22} box={depth > 0 ? 22 : 28} />
      {large ? (
        // Large text: the name wraps and the status gets its own line on every row, so dates align.
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Text style={uiStyles.label}>
            {name}{context ? <Text style={uiStyles.caption}>{`  ${context}`}</Text> : null}
          </Text>
          {kindLabel || status ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
              {kindLabel ? <Badge label={kindLabel} /> : null}
              {status}
            </View>
          ) : null}
          {path ? <Text selectable style={uiStyles.caption}>{path}</Text> : null}
        </View>
      ) : (
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
          <Text numberOfLines={1} style={[uiStyles.label, { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }]}>
            {name}{context ? <Text style={uiStyles.caption}>{`  ${context}`}</Text> : null}
          </Text>
          {kindLabel ? <Badge label={kindLabel} /> : null}
          {status}
          {path ? <Text selectable style={[uiStyles.caption, { flexBasis: "100%" }]}>{path}</Text> : null}
        </View>
      )}
    </PressableCard>
  );
  const swipeable = (
    <SwipeActions actions={actions} disabled={disabled}>
      {row}
      <View accessible={false} style={[uiStyles.separator, { marginStart: space.xs + depth * space.lg + gapIcon + (depth > 0 ? 22 : 28) }]} />
    </SwipeActions>
  );
  if (!grouped) return swipeable;
  return (
    <View style={{ marginStart: space.md, paddingStart: space.xs, borderStartWidth: metrics.groupGuide, borderStartColor: colors.separator }}>
      {swipeable}
    </View>
  );
});

/** Collapsible group header: flat row with group icon, bold name, a quiet count and chevron. */
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
  const { fontScale } = useWindowDimensions();
  const runningLabel = copy("{p0} çalışıyor", "{p0} running", { p0: running });
  const content = (
    <>
      <ProjectIcon appearance={appearance} group size={22} box={28} />
      <Text numberOfLines={fontScale > 1 ? undefined : 1} style={[uiStyles.label, { flex: 1, minWidth: 0, fontWeight: "700" }]}>{name}</Text>
      {running ? <StatusText label={runningLabel} tone="live" /> : null}
      {/* A count is a quiet number, never a pill. */}
      <StatusText label={String(count)} />
      {collapsible ? <DisclosureChevron expanded={expanded} color={colors.muted} size={16} /> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: gapIcon,
    // Same row height, icon box and start inset as a project row, so group and project read as
    // one hierarchy (like the desktop rail): the group is a bold flat header, its projects nest below.
    minHeight: metrics.rowHeightProject,
    paddingStart: space.xs,
    paddingEnd: space.xs,
    marginTop: first ? 0 : space.sm,
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
