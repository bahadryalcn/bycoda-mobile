import { useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import { Pressable } from "./gluestack/pressable";
import { Body } from "./typography";
import { colors, metrics, opacity, space } from "./tokens";
import { uiStyles } from "./styles";
import Animated from "react-native-reanimated";
import { resize } from "./motion";
import { DisclosureBody, DisclosureChevron } from "./disclosure-motion";

export function Disclosure({
  label,
  children,
  detail,
  defaultExpanded = false,
}: PropsWithChildren<{ label: string; detail?: string; defaultExpanded?: boolean }>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
          setExpanded((current) => !current);
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
        <DisclosureChevron
          expanded={expanded}
          size={16}
          color={expanded ? colors.text : colors.muted}
        />
        <View style={[uiStyles.grow, { gap: 2 }]}>
          <Body style={uiStyles.buttonLabel}>{label}</Body>
          {detail && !expanded ? (
            <Body muted numberOfLines={1} style={uiStyles.caption}>
              {detail}
            </Body>
          ) : null}
        </View>
      </Pressable>
      {visited ? <DisclosureBody expanded={expanded}>{children}</DisclosureBody> : null}
    </Animated.View>
  );
}
