import { useMobileTheme } from "./theme";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { useDisclosure } from "panelui-native/hooks/use-disclosure";
import { View } from "react-native";
import { Pressable } from "react-native";
import { Body } from "./typography";
import { metrics, opacity, space, type SemanticTone } from "./tokens";
import Animated from "react-native-reanimated";
import { resize } from "./motion";
import { DisclosureBody, DisclosureChevron } from "./disclosure-motion";

export function Disclosure({
  label,
  children,
  detail,
  feedback,
  defaultExpanded = false,
  tone,
}: PropsWithChildren<{ label: string; detail?: string; feedback?: ReactNode; defaultExpanded?: boolean; tone?: SemanticTone }>) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const { isOpen: expanded, toggle } = useDisclosure({ defaultOpen: defaultExpanded });
  const [visited, setVisited] = useState(defaultExpanded);
  return (
    <Animated.View layout={resize} style={{ gap: expanded ? space.sm : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
        onPress={() => {
          setVisited(true);
          toggle();
        }}
        style={({ pressed }) => ({
          minHeight: metrics.controlHeight,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingVertical: 3,
          opacity: pressed ? opacity.pressed : 1,
        })}
      >
        <View style={[uiStyles.grow, { gap: 2 }]}>
          <Body style={[uiStyles.buttonLabel, { fontWeight: "500" }, tone && { color: semanticColors[tone].text }]}>
            {label}
          </Body>
          {detail && !expanded ? (
            <Body muted style={uiStyles.caption}>
              {detail}
            </Body>
          ) : null}
        </View>
        <DisclosureChevron expanded={expanded} size={16} color={colors.muted} />
      </Pressable>
      {visited ? <DisclosureBody expanded={expanded}>{children}</DisclosureBody> : null}
      {feedback ? <View style={{ paddingTop: expanded ? 0 : space.sm }}>{feedback}</View> : null}
    </Animated.View>
  );
}
