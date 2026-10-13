import { Children, createContext, Fragment, isValidElement, use, type ReactNode } from "react";
import { View, type TextProps } from "react-native";
import { Pressable } from "./gluestack/pressable";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { colors, metrics, opacity, semanticColors, space, type SemanticTone } from "./tokens";
import { uiStyles } from "./styles";
import type { ContainerProps } from "./component-props";

const GroupedNavigation = createContext(false);

/** Related rows share one surface and one divider, instead of nested cards. */
export function NavigationGroup({ children, style }: ContainerProps) {
  const rows = Children.toArray(children);
  return (
    <GroupedNavigation value>
      <View style={[uiStyles.card, { padding: 0, gap: 0, overflow: "hidden" }, style]}>
        {rows.map((row, index) => (
          <Fragment key={isValidElement(row) ? row.key : index}>
            {index ? (
              <View style={[uiStyles.separator, { marginStart: space.lg, marginEnd: space.lg }]} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </GroupedNavigation>
  );
}

export function Separator({ style }: Pick<ContainerProps, "style">) {
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
}: {
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
  const grouped = use(GroupedNavigation);
  const plain = variant === "plain" || (variant !== "card" && grouped);
  const semantic = tone ? semanticColors[tone] : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.press,
        plain && { borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" },
        semantic && !plain && { borderColor: semantic.border, backgroundColor: semantic.surface },
        {
          minHeight: icon && detail ? 64 : metrics.selectionHeight,
          paddingHorizontal: space.lg,
          paddingVertical: space.row,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
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
        <Body numberOfLines={2} style={[uiStyles.label, semantic && { color: semantic.text }]}>
          {label}
        </Body>
        {detail ? (
          <Body
            muted
            numberOfLines={detailLines}
            selectable={detailSelectable}
            ellipsizeMode={detailEllipsizeMode}
            style={uiStyles.caption}
          >
            {detail}
          </Body>
        ) : null}
      </View>
      {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
      <ChevronRight size={15} color={colors.subtle} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}
