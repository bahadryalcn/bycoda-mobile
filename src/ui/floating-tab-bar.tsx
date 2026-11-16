import { useEffect, useState } from "react";
import { type ComponentProps, type ReactNode } from "react";
import { I18nManager, Text, View, useWindowDimensions } from "react-native";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import type { Tabs } from "expo-router";
import { DockIcon } from "./dock-icon";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "./dialogs";
import { NavigationRow } from "./navigation-row";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, metrics, opacity, radii, space } from "./tokens";
import { haptic } from "./motion";
import { useReducedMotionPreference } from "./use-reduced-motion";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
export type FloatingTabBarProps = TabBarProps & {
  /** Measured navigation height including safe area; zero while keyboard hides it. */
  onInsetChange?: (height: number) => void;
  /** Session creation is a command, not another navigation destination. */
  quickAction?: { label: string; optionsLabel: string; onPress(): void; onLongPress(): void };
};

function TabItem({
  label,
  accessibleLabel = label,
  focused,
  icon,
  badge,
  onPress,
  onLongPress,
}: {
  label: string;
  accessibleLabel?: string;
  focused: boolean;
  icon: ReactNode;
  badge?: string | number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  return (
    // Tabs.Trigger cannot forward route labels or long-press events; the navigator owns selection.
    <AnimatedPressable
      pressScale={1}
      pressOpacity={reducedMotion ? 1 : opacity.pressed}
      accessibilityRole="tab"
      accessibilityLabel={accessibleLabel}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        {
          width: metrics.touchTarget,
          height: metrics.touchTarget,
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.control,
        },
      ]}
    >
      <View
        style={{
          width: metrics.touchTarget - space.sm,
          minHeight: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
        {badge ? (
          <Text
            style={{
              position: "absolute",
              top: -space.sm,
              end: -space.xs,
              paddingHorizontal: space.xxs,
              borderRadius: radii.badge,
              backgroundColor: colors.accentSolid,
              color: colors.primaryText,
              fontSize: fontSize.caption,
              fontVariant: ["tabular-nums"],
            }}
          >
            {badge}
          </Text>
        ) : null}
      </View>
      {focused ? (
        <View
          style={{
            position: "absolute",
            bottom: space.xs,
            width: space.xs,
            height: space.xs,
            borderRadius: radii.pill,
            backgroundColor: colors.accent,
          }}
        />
      ) : null}
    </AnimatedPressable>
  );
}

/** Content-width icon dock without movement. Large text moves overflow destinations into a sheet. */
export function FloatingTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  onInsetChange,
  quickAction,
}: FloatingTabBarProps) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const keyboard = useKeyboardState((s) => s.isVisible);
  const [more, setMore] = useState(false);
  const available = Math.min(
    metrics.contentWidth,
    width - Math.max(insets.left, space.xs) - Math.max(insets.right, space.xs),
  );
  const commandWidth = quickAction ? metrics.touchTarget + space.sm * 2 + 1 : 0;
  const slots = Math.max(
    2,
    Math.floor(
      (available - space.sm * 2 - 2 - commandWidth) /
        (metrics.touchTarget * Math.max(1, fontScale)),
    ),
  );
  const overflow = slots < state.routes.length;
  const shown = overflow ? state.routes.slice(0, slots - 1) : state.routes;
  const hidden = overflow ? state.routes.slice(slots - 1) : [];
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
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) => onInsetChange?.(layout.height)}
        style={{
          position: "absolute",
          start: 0,
          end: 0,
          bottom: 0,
          paddingStart: Math.max(I18nManager.isRTL ? insets.right : insets.left, space.xs),
          paddingEnd: Math.max(I18nManager.isRTL ? insets.left : insets.right, space.xs),
          paddingTop: space.xs,
          paddingBottom: Math.max(insets.bottom, space.xs),
        }}
      >
        <View
          style={{
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.panel,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radii.composer,
            padding: space.sm,
            shadowColor: colors.scrim,
            shadowOffset: { width: 0, height: space.xs },
            shadowOpacity: 0.18,
            shadowRadius: space.sm,
            elevation: 4,
          }}
        >
          <View
            accessibilityRole="tablist"
            style={{
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
                  badge={options.tabBarBadge as string | number | undefined}
                  icon={options.tabBarIcon?.({
                    focused,
                    color: focused ? colors.text : colors.muted,
                    size: 24,
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
                focused={hidden.some((route) => state.routes[state.index]?.key === route.key)}
                icon={
                  <DockIcon
                    name="more"
                    color={
                      hidden.some((route) => state.routes[state.index]?.key === route.key)
                        ? colors.text
                        : colors.muted
                    }
                  />
                }
                onPress={() => setMore(true)}
              />
            ) : null}
          </View>
          {quickAction ? (
            <>
              <View
                style={{
                  width: 1,
                  height: 24,
                  marginHorizontal: space.sm,
                  backgroundColor: colors.border,
                }}
              />
              <AnimatedPressable
                pressScale={1}
                pressOpacity={reducedMotion ? 1 : opacity.pressed}
                accessibilityRole="button"
                accessibilityLabel={quickAction.label}
                accessibilityHint={quickAction.optionsLabel}
                accessibilityActions={[{ name: "longpress", label: quickAction.optionsLabel }]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === "longpress") quickAction.onLongPress();
                }}
                onPress={quickAction.onPress}
                onLongPress={quickAction.onLongPress}
                style={{
                  width: metrics.touchTarget,
                  minWidth: metrics.touchTarget,
                  minHeight: metrics.touchTarget,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: metrics.touchTarget,
                    height: metrics.touchTarget,
                    borderRadius: radii.bubble,
                    backgroundColor: colors.accentSolid,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DockIcon name="new-session" color={colors.primaryText} />
                </View>
              </AnimatedPressable>
            </>
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
