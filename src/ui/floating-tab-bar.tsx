import { useMobileTheme } from "./theme";
import { useState, type ComponentProps } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, metrics, opacity, radii, space } from "./tokens";
import { haptic } from "./motion";

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

function TabItem({
  label,
  focused,
  badge,
  icon,
  onPress,
  onLongPress,
  columns,
}: {
  label: string;
  focused: boolean;
  badge?: string | number;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  columns: number;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        {
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: `${100 / columns}%`,
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          borderRadius: radii.control,
          backgroundColor: focused ? colors.selected : "transparent",
          paddingHorizontal: space.xxs,
          paddingVertical: space.xs,
        },
        pressed && { opacity: opacity.pressed },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          maxWidth: "100%",
        }}
      >
        {icon}
        {badge ? (
          <View
            style={{
              minWidth: 17,
              minHeight: 17,
              maxWidth: "100%",
              paddingHorizontal: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.accentSolid,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: colors.primaryText,
                fontSize: fontSize.micro - 1,
                lineHeight: 12,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          alignSelf: "stretch",
          minWidth: 0,
          flexShrink: 1,
          textAlign: "center",
          color: focused ? colors.accent : colors.muted,
          fontSize: fontSize.micro,
          lineHeight: 14,
          fontWeight: focused ? "700" : "600",
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Primary destinations stay visible; scaled labels grow vertically within equal columns. */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: TabBarProps) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const availableWidth =
    measuredWidth ||
    Math.min(
      metrics.contentWidth,
      width -
        Math.max(insets.left, space.sm) -
        Math.max(insets.right, space.sm),
    );
  const columns = Math.max(
    1,
    Math.min(
      state.routes.length,
      Math.floor(
        (availableWidth - space.xxs * 2) /
          (metrics.touchTarget * Math.max(1, fontScale)),
      ),
    ),
  );
  const keyboard = useKeyboardState((state) => state.isVisible);
  if (keyboard) return null;
  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: 0,
        paddingBottom: Math.max(insets.bottom, space.sm),
        paddingStart: Math.max(insets.left, space.sm),
        paddingEnd: Math.max(insets.right, space.sm),
        alignItems: "center",
      }}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
        style={{
          width: "100%",
          maxWidth: metrics.contentWidth,
          minHeight: metrics.tabBarHeight,
          borderRadius: 0,
          borderCurve: "continuous",
          backgroundColor: colors.panel,
          borderWidth: 0,
          borderColor: colors.separator,
          boxShadow: undefined,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "stretch",
            padding: space.xxs,
          }}
        >
          {state.routes.map((route, index) => {
            const options = descriptors[route.key]!.options;
            const focused = state.index === index;
            const label =
              typeof options.title === "string" ? options.title : route.name;
            const color = focused ? colors.accent : colors.muted;
            return (
              <TabItem
                key={route.key}
                label={label}
                focused={focused}
                columns={columns}
                badge={options.tabBarBadge as string | number | undefined}
                icon={options.tabBarIcon?.({ focused, color, size: 22 })}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    haptic.select();
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() =>
                  navigation.emit({ type: "tabLongPress", target: route.key })
                }
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
