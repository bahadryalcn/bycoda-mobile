import { useMobileTheme } from "./theme";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, fontSize, metrics, radii, space } from "./tokens";
import { haptic, indicatorSpring, usePressMotion } from "./motion";
import { useReducedMotionPreference } from "./use-reduced-motion";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = process.env.EXPO_OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

function TabItem({
  label,
  focused,
  badge,
  icon,
  onPress,
  onLongPress,
  onLayout,
}: {
  label: string;
  focused: boolean;
  badge?: string | number;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const press = usePressMotion(0.9);
  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={onLayout}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          flexGrow: 1,
          flexShrink: 0,
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
        },
        press.animatedStyle,
      ]}
    >
      <View>
        {icon}
        {badge ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              end: -10,
              minWidth: 17,
              height: 17,
              paddingHorizontal: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.accentSolid,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.panel,
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
    </AnimatedPressable>
  );
}

/** Intrinsic labels share available room, then scroll instead of compressing scaled text. */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { mode } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const reducedMotion = useReducedMotionPreference();
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const [items, setItems] = useState<Record<string, { x: number; width: number }>>({});
  const selected = items[state.routes[state.index]!.key];
  const position = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  useEffect(() => {
    if (!selected) return;
    position.value = reducedMotion ? selected.x : withSpring(selected.x, indicatorSpring);
    indicatorWidth.value = reducedMotion ? selected.width : withSpring(selected.width, indicatorSpring);
    scroller.current?.scrollTo({ x: Math.max(0, selected.x - (width - selected.width) / 2), animated: !reducedMotion });
  }, [selected, width, keyboard, position, indicatorWidth, reducedMotion]);
  const indicator = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: position.value }],
  }));
  if (keyboard) return null;
  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: space.xs,
        paddingBottom: Math.max(insets.bottom, space.sm),
        paddingStart: Math.max(insets.left, space.sm),
        paddingEnd: Math.max(insets.right, space.sm),
        alignItems: "center",
      }}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{
          width: "100%",
          maxWidth: metrics.entryWidth,
          minHeight: metrics.tabBarHeight,
          borderRadius: radii.pill,
          borderCurve: "continuous",
          backgroundColor: colors.panel,
          borderWidth: mode === "dark" ? 0.5 : 0,
          borderColor: colors.separator,
          boxShadow: mode === "dark" ? undefined : `0px 6px 24px -6px ${colors.scrim}`,
        }}
      >
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, flexShrink: 0, width: "100%" }}
          contentContainerStyle={{ flexDirection: "row", flexGrow: 1, padding: 4 }}
        >
        {selected ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 4,
                bottom: 4,
                start: 0,
                borderRadius: radii.pill,
                borderCurve: "continuous",
                backgroundColor: colors.fill,
              },
              indicator,
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]!.options;
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? colors.accent : colors.muted;
          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              onLayout={({ nativeEvent: { layout } }) => setItems((current) => {
                const previous = current[route.key];
                if (previous?.x === layout.x && previous.width === layout.width) return current;
                return { ...current, [route.key]: { x: layout.x, width: layout.width } };
              })}
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
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
        </ScrollView>
      </View>
    </View>
  );
}
