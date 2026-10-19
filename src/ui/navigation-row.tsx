import { useMobileTheme } from "@/ui/theme";
import { Children, createContext, Fragment, isValidElement, use, type ReactNode } from "react";
import { View, type TextProps } from "react-native";
import { Pressable } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { colors, opacity, semanticColors, space, type SemanticTone } from "./tokens";
import { uiStyles } from "./styles";
import type { ContainerProps } from "./component-props";

const GroupedNavigation = createContext(false);
/** True inside a NavigationGroup, so row-like controls can adopt list padding. */
export const useInNavigationGroup = () => use(GroupedNavigation);

/** Related rows share one surface and one divider, instead of nested cards. */
export function NavigationGroup({ children, style }: ContainerProps) {
  useMobileTheme();
  const rows = Children.toArray(children);
  return (
    <GroupedNavigation value>
      <View style={[uiStyles.card, { padding: 0, gap: 0, overflow: "hidden" }, style]}>
        {rows.map((row, index) => (
          <Fragment key={isValidElement(row) ? row.key : index}>
            {index ? (
              <View
                style={[
                  uiStyles.separator,
                  {
                    marginStart:
                      space.lg +
                      (isValidElement<{ icon?: unknown }>(row) && row.props.icon ? 32 + space.row : 0),
                  },
                ]}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
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
  tone,
  variant,
  detailLines = 1,
  detailSelectable = true,
  detailEllipsizeMode,
  emphasized,
}: {
  /** Bold label, e.g. an unread inbox item. */
  emphasized?: boolean;
  label: string;
  detail?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  tone?: SemanticTone;
  variant?: "card" | "plain";
  detailLines?: number;
  detailSelectable?: boolean;
  detailEllipsizeMode?: TextProps["ellipsizeMode"];
}) {
  useMobileTheme();
  const grouped = use(GroupedNavigation);
  const plain = variant === "plain" || (variant !== "card" && grouped);
  const semantic = tone ? semanticColors[tone] : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: !!disabled }}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.press,
        plain && { borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
        semantic && !plain && { borderColor: semantic.border, backgroundColor: semantic.surface },
        {
          minHeight: detail ? 62 : 52,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          opacity: disabled ? opacity.disabled : 1,
        },
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
      </View>
      {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
      <ChevronRight size={17} strokeWidth={2.4} color={colors.tertiary} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}
