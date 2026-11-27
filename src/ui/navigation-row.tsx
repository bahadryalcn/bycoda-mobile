import { useMobileTheme } from "@/ui/theme";
import { type ReactNode, type Ref } from "react";
import { StyleSheet, View, useWindowDimensions, type HostInstance, type TextProps } from "react-native";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { Separator as PanelSeparator } from "panelui-native/components/separator";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Check from "lucide-react-native/icons/check";
import { Body } from "./typography";
import { BusyIndicator } from "./busy-indicator";
import { useHover } from "./use-hover";
import { GroupedNavigation, useInNavigationGroup } from "./navigation-group-context";
import { rowPressMotion, useRowPress } from "./row-press";
import { gapIcon, iconSize, metrics, opacity, space, type SemanticTone } from "./tokens";
import type { ComponentType } from "react";
import type { ContainerProps } from "./component-props";

export { useInNavigationGroup };

/** Related navigation shares one rhythm without adding a decorative container. */
export function NavigationGroup({ children, style }: ContainerProps) {
  useMobileTheme();
  return (
    <GroupedNavigation value>
      <View style={[{ gap: 0 }, style]}>{children}</View>
    </GroupedNavigation>
  );
}

/**
 * The one leading glyph of a list row: a 20dp muted lucide glyph, no tile or fill, centred in the
 * row's 32dp leading slot (`metrics.rowLeading`) so labels align with provider marks and avatars.
 * `tone="danger"` matches a destructive row's label.
 */
export function RowIcon({ glyph: Glyph, tone }: {
  glyph: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>; tone?: "danger";
}) {
  const { colors, semanticColors } = useMobileTheme();
  return <Glyph size={iconSize.row} strokeWidth={1.8} color={tone ? semanticColors[tone].text : colors.muted} />;
}

export function Separator({ style }: Pick<ContainerProps, "style">) {
  const { colors } = useMobileTheme();
  return <PanelSeparator thickness={StyleSheet.hairlineWidth} style={[{ backgroundColor: colors.separator }, style]} />;
}

export function NavigationRow({
  label,
  detail,
  icon,
  trailing,
  onPress,
  disabled,
  busy,
  selected,
  tintSelected = true,
  tone,
  variant,
  detailLines = 1,
  labelLines,
  metadata,
  supporting,
  metadataLines = 2,
  detailSelectable = true,
  detailEllipsizeMode,
  emphasized,
  separator,
  accessibilityLabel,
  ref,
  intent = selected === undefined ? "navigate" : "select",
  compact = false,
}: {
  /** Single-line action menus use the standard 48dp touch target. */
  compact?: boolean;
  /** Inset hairline under the row; defaults to true inside a NavigationGroup. */
  separator?: boolean;
  /** Bold label, e.g. an unread inbox item. */
  emphasized?: boolean;
  label: string;
  /** Optional preview limit when the full label has an explicit reader. */
  labelLines?: number;
  accessibilityLabel?: string;
  ref?: Ref<HostInstance>;
  detail?: string;
  /** Secondary context gets its own space rather than displacing the main description. */
  metadata?: string;
  /** Wrapping status/context below identity; reserve trailing for compact accessories. */
  supporting?: ReactNode;
  metadataLines?: number;
  icon?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Selection for a visible exclusive choice, independent of disabled state. */
  selected?: boolean;
  /** Set false when the selection is shown by a trailing mark alone; still reported to assistive tech. */
  tintSelected?: boolean;
  tone?: SemanticTone;
  variant?: "card" | "plain";
  /** Navigation reveals a destination; choices and commands have no chevron. */
  intent?: "navigate" | "select" | "command";
  detailLines?: number;
  detailSelectable?: boolean;
  detailEllipsizeMode?: TextProps["ellipsizeMode"];
}) {
  const { colors, semanticColors, uiStyles, pressedFill } = useMobileTheme();
  const hover = useHover(disabled || busy);
  const press = useRowPress();
  const choice = intent === "select";
  const plain = variant !== "card";
  const semantic = tone ? semanticColors[tone] : undefined;
  const inGroup = useInNavigationGroup();
  const line = separator ?? inGroup;
  // Enlarged system text lets supporting lines grow instead of clipping them at the compact row limits.
  const grows = useWindowDimensions().fontScale > 1;
  const row = (
    <AnimatedPressable
      ref={ref}
      // A choice reads as a radio with its checked state, like SelectField options; others are buttons.
      accessibilityRole={choice ? "radio" : "button"}
      {...rowPressMotion}
      accessibilityLabel={accessibilityLabel ?? [label, detail, metadata].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy,
        ...(choice ? { checked: !!selected } : selected === undefined ? {} : { selected }) }}
      aria-pressed={choice ? undefined : selected}
      aria-checked={choice ? !!selected : undefined}
      aria-disabled={!!disabled || !!busy}
      aria-busy={!!busy}
      disabled={disabled || busy}
      onPress={onPress}
      {...hover.handlers}
      {...press.handlers}
      style={[
        uiStyles.press,
        plain && { borderWidth: 0, backgroundColor: hover.hovered && !selected ? colors.raised : "transparent" },
        !plain && { marginHorizontal: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel },
        semantic && !plain && { borderColor: semantic.border, backgroundColor: semantic.surface },
        {
          minHeight: compact ? metrics.touchTarget : detail || metadata ? metrics.rowHeightSession : metrics.rowHeightProject,
          paddingHorizontal: plain ? space.sm : space.md,
          paddingVertical: compact ? space.sm + space.xxs : space.row,
          flexDirection: "row",
          alignItems: "center",
          gap: gapIcon,
          opacity: disabled && !busy ? opacity.disabled : 1,
        },
        selected && tintSelected && { backgroundColor: colors.selected },
        press.pressed && { backgroundColor: pressedFill },
      ]}
    >
      {icon ? <View style={uiStyles.rowLeading}>{icon}</View> : null}
      <View style={[uiStyles.grow, { gap: space.xxs }]}>
        {/* The row is the pressable: a selectable label would claim long-press on Android and swallow row presses. */}
        <Body
          selectable={false}
          numberOfLines={labelLines}
          style={[
            uiStyles.label,
            emphasized && { fontWeight: "700" },
            semantic && { color: semantic.text },
          ]}
        >
          {label}
        </Body>
        {detail ? (
          <Body
            muted
            numberOfLines={grows ? undefined : detailLines}
            selectable={detailSelectable}
            ellipsizeMode={detailEllipsizeMode}
            style={uiStyles.caption}
          >
            {detail}
          </Body>
        ) : null}
        {metadata ? <Body muted numberOfLines={grows ? undefined : metadataLines} style={uiStyles.caption}>
          {metadata}
        </Body> : null}
        {supporting}
      </View>
      {trailing ? <View style={{ flexShrink: 1, maxWidth: "50%" }}>{trailing}</View> : null}
      {busy ? <BusyIndicator size="sm" color={colors.accent} />
        : intent === "navigate" ? <ChevronRight size={14} strokeWidth={2.4} color={colors.tertiary} style={{ flexShrink: 0 }} />
        : intent === "select" && selected && !trailing ? <Check size={iconSize.check} color={colors.accent} style={{ flexShrink: 0 }} />
        : null}
    </AnimatedPressable>
  );
  return line ? <View>{row}<Separator /></View> : row;
}
