import { useMobileTheme } from "@/ui/theme";
import { createContext, use, type ReactNode } from "react";
import { View, type TextProps } from "react-native";
import { Pressable } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Check from "lucide-react-native/icons/check";
import { Body } from "./typography";
import { BusyIndicator } from "./busy-indicator";
import { colors, opacity, semanticColors, space, type SemanticTone } from "./tokens";
import { uiStyles } from "./styles";
import type { ContainerProps } from "./component-props";

const GroupedNavigation = createContext(false);
/** True inside a NavigationGroup, so row-like controls can adopt list padding. */
export const useInNavigationGroup = () => use(GroupedNavigation);

/** Related navigation shares one rhythm without adding a decorative container. */
export function NavigationGroup({ children, style }: ContainerProps) {
  useMobileTheme();
  return (
    <GroupedNavigation value>
      <View style={[{ gap: 0 }, style]}>{children}</View>
    </GroupedNavigation>
  );
}

export function Separator({ style }: Pick<ContainerProps, "style">) {
  useMobileTheme();
  return <View accessible={false} style={[uiStyles.separator, style]} />;
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
  accessibilityLabel,
  intent = selected === undefined ? "navigate" : "select",
}: {
  /** Bold label, e.g. an unread inbox item. */
  emphasized?: boolean;
  label: string;
  /** Optional preview limit when the full label has an explicit reader. */
  labelLines?: number;
  accessibilityLabel?: string;
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
  tone?: SemanticTone;
  variant?: "card" | "plain";
  /** Navigation reveals a destination; choices and commands have no chevron. */
  intent?: "navigate" | "select" | "command";
  detailLines?: number;
  detailSelectable?: boolean;
  detailEllipsizeMode?: TextProps["ellipsizeMode"];
}) {
  useMobileTheme();
  const plain = variant !== "card";
  const semantic = tone ? semanticColors[tone] : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, detail, metadata].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy, ...(selected === undefined ? {} : { selected }) }}
      aria-pressed={selected}
      aria-disabled={!!disabled || !!busy}
      aria-busy={!!busy}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.press,
        plain && { borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
        semantic && !plain && { borderColor: semantic.border, backgroundColor: semantic.surface },
        {
          minHeight: detail ? 60 : 48,
          paddingHorizontal: plain ? 0 : space.md,
          paddingVertical: space.sm,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          opacity: disabled && !busy ? opacity.disabled : 1,
        },
        selected && { backgroundColor: colors.selected },
        pressed && { backgroundColor: semantic?.surface ?? colors.raised },
      ]}
    >
      {icon ? (
        <View style={{ alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </View>
      ) : null}
      <View style={[uiStyles.grow, { gap: 2 }]}>
        <Body
          numberOfLines={labelLines}
          style={[
            uiStyles.label,
            emphasized && { fontWeight: "600" },
            semantic && { color: semantic.text },
          ]}
        >
          {label}
        </Body>
        {detail ? (
          <Body
            muted
            numberOfLines={detailLines}
            selectable={detailSelectable}
            ellipsizeMode={detailEllipsizeMode}
            style={[uiStyles.caption, { lineHeight: 18 }]}
          >
            {detail}
          </Body>
        ) : null}
        {metadata ? <Body muted numberOfLines={metadataLines} style={[uiStyles.caption, { lineHeight: 18 }]}>
          {metadata}
        </Body> : null}
        {supporting}
      </View>
      {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
      {busy ? <BusyIndicator size="sm" color={colors.accent} />
        : intent === "navigate" ? <ChevronRight size={17} strokeWidth={2.4} color={colors.tertiary} style={{ flexShrink: 0 }} />
        : intent === "select" && selected && !trailing ? <Check size={18} color={colors.accent} style={{ flexShrink: 0 }} />
        : null}
    </Pressable>
  );
}
