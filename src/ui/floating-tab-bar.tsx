import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { Tabs } from "expo-router";
import MoreHorizontal from "lucide-react-native/icons/more-horizontal";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "./dialogs";
import { NavigationRow } from "./navigation-row";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, metrics, opacity, radii, space } from "./tokens";
import { haptic } from "./motion";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
export type FloatingTabBarProps = TabBarProps & {
  /** Measured navigation height including safe area; zero while keyboard hides it. */
  onInsetChange?: (height: number) => void;
};

function TabItem({
  label,
  accessibleLabel = label,
  focused,
  icon,
  badge,
  width,
  onPress,
  onLongPress,
}: {
  label: string;
  accessibleLabel?: string;
  focused: boolean;
  icon: ReactNode;
  badge?: string | number;
  width: `${number}%`;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibleLabel}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        {
          width,
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          gap: space.xs,
          paddingHorizontal: space.xxs,
          paddingVertical: space.sm,
          opacity: pressed ? opacity.pressed : 1,
        },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xxs,
          paddingHorizontal: space.sm,
          paddingVertical: space.xxs,
          borderRadius: radii.control,
          backgroundColor: focused ? colors.fill : "transparent",
        }}
      >
        {icon}
        {badge ? (
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize.caption,
              fontVariant: ["tabular-nums"],
            }}
          >
            {badge}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          maxWidth: "100%",
          textAlign: "center",
          fontSize: fontSize.caption,
          fontWeight: focused ? "700" : "500",
          color: focused ? colors.text : colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One quiet row. Large text moves overflow destinations into an accessible sheet. */
export function FloatingTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  onInsetChange,
}: FloatingTabBarProps) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const keyboard = useKeyboardState((s) => s.isVisible);
  const [more, setMore] = useState(false);
  const available = Math.min(
    metrics.contentWidth,
    width - Math.max(insets.left, space.xs) - Math.max(insets.right, space.xs),
  );
  const slots = Math.max(2, Math.floor(available / (metrics.touchTarget * Math.max(1, fontScale))));
  const overflow = slots < state.routes.length;
  const shown = overflow ? state.routes.slice(0, slots - 1) : state.routes;
  const hidden = overflow ? state.routes.slice(slots - 1) : [];
  const tabWidth = `${100 / (shown.length + Number(overflow))}%` as const;
  // Navigator content and toasts clear exactly the rendered navigation footprint.
  useEffect(() => {
    if (keyboard) {
      onInsetChange?.(0);
      setMore(false);
    }
  }, [keyboard, onInsetChange]);
  // Unmount releases the clearance owned by this navigation instance.
  useEffect(() => () => onInsetChange?.(0), [onInsetChange]);
  const label = (route: (typeof state.routes)[number]) =>
    descriptors[route.key]!.options.title ?? route.name;
  const badgeLabel = (route: (typeof state.routes)[number]) => {
    const options = descriptors[route.key]!.options;
    return (
      options.tabBarAccessibilityLabel ??
      (options.tabBarBadge ? `${label(route)}, ${options.tabBarBadge}` : label(route))
    );
  };
  const hiddenBadges = hidden.filter((route) => descriptors[route.key]!.options.tabBarBadge);
  const moreLabel = copy("Diğer", "More");
  const overflowLabel = [moreLabel, ...hiddenBadges.map(badgeLabel)].join(". ");
  const overflowBadge =
    hiddenBadges.map((route) => String(descriptors[route.key]!.options.tabBarBadge)).join(", ") ||
    undefined;
  const navigate = (route: (typeof state.routes)[number]) => {
    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    setMore(false);
    if (state.routes[state.index]?.key !== route.key) {
      haptic.select();
      navigateToTab(route.key);
    }
  };
  if (keyboard) return null;
  return (
    <>
      <View
        onLayout={({ nativeEvent: { layout } }) => onInsetChange?.(layout.height)}
        style={{
          position: "absolute",
          start: 0,
          end: 0,
          bottom: 0,
          backgroundColor: colors.panel,
          paddingStart: Math.max(insets.left, space.xs),
          paddingEnd: Math.max(insets.right, space.xs),
          paddingTop: space.xs,
          paddingBottom: Math.max(insets.bottom, space.xs),
        }}
      >
        <View
          accessibilityRole="tablist"
          style={{
            width: "100%",
            maxWidth: metrics.contentWidth,
            alignSelf: "center",
            flexDirection: "row",
          }}
        >
          {shown.map((route) => {
            const options = descriptors[route.key]!.options;
            const focused = state.routes[state.index]?.key === route.key;
            return (
              <TabItem
                key={route.key}
                label={String(label(route))}
                accessibleLabel={String(badgeLabel(route))}
                focused={focused}
                width={tabWidth}
                badge={options.tabBarBadge as string | number | undefined}
                icon={options.tabBarIcon?.({
                  focused,
                  color: focused ? colors.text : colors.muted,
                  size: 22,
                })}
                onPress={() => navigate(route)}
                onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              />
            );
          })}
          {overflow ? (
            <TabItem
              label={moreLabel}
              accessibleLabel={overflowLabel}
              badge={overflowBadge}
              width={tabWidth}
              focused={hidden.some((route) => state.routes[state.index]?.key === route.key)}
              icon={<MoreHorizontal size={22} color={colors.muted} />}
              onPress={() => setMore(true)}
            />
          ) : null}
        </View>
      </View>
      {more ? (
        <Sheet
          visible
          title={copy("Gezinme", "Navigation")}
          size="compact"
          onClose={() => setMore(false)}
        >
          {hidden.map((route) => (
            <NavigationRow
              key={route.key}
              label={String(label(route))}
              accessibilityLabel={String(badgeLabel(route))}
              trailing={
                descriptors[route.key]!.options.tabBarBadge ? (
                  <Text
                    accessible={false}
                    style={{
                      color: colors.text,
                      fontSize: fontSize.caption,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {String(descriptors[route.key]!.options.tabBarBadge)}
                  </Text>
                ) : undefined
              }
              selected={state.routes[state.index]?.key === route.key}
              onPress={() => navigate(route)}
            />
          ))}
        </Sheet>
      ) : null}
    </>
  );
}
