import { useEffect, useState } from "react";
import { type ComponentProps, type ReactNode } from "react";
import { I18nManager, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import type { Tabs } from "expo-router";
import { DockIcon } from "./dock-icon";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "./dialogs";
import { NavigationRow } from "./navigation-row";
import { useAppearance } from "../state/appearance";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, iconSize, lineHeight, metrics, opacity, radii, space } from "./tokens";
import { haptic } from "./motion";
import { wideDock } from "./adaptive-layout-model";
import { useReducedMotionPreference } from "./use-reduced-motion";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
export type FloatingTabBarProps = TabBarProps & {
  /** Measured navigation height including safe area; zero while keyboard hides it. */
  onInsetChange?: (height: number) => void;
  /** Session creation is a command, not another navigation destination. */
  quickAction?: { label: string; onPress(): void };
};

/** Badge value that draws an unread dot (desktop's rail dot) instead of a count pill. */
export const TAB_BADGE_DOT = "dot";

/** Count pill, or a dot for `TAB_BADGE_DOT`, pinned to the corner of a destination icon. */
export function TabBadge({ badge, top, end }: { badge: string | number; top: number; end: number }) {
  const { colors } = useMobileTheme();
  if (badge === TAB_BADGE_DOT)
    return (
      <View
        accessible={false}
        style={{
          position: "absolute",
          top,
          end,
          width: space.row,
          height: space.row,
          borderRadius: radii.pill,
          backgroundColor: colors.accentSolid,
        }}
      />
    );
  return (
    <Text
      accessible={false}
      style={{
        position: "absolute",
        top,
        end,
        paddingHorizontal: space.xxs,
        borderRadius: radii.badge,
        backgroundColor: colors.accentSolid,
        color: colors.primaryText,
        fontSize: fontSize.caption,
        lineHeight: lineHeight.caption,
        fontVariant: ["tabular-nums"],
      }}
      // The count sits over a 24dp glyph; at the largest text sizes it would cover the icon.
      maxFontSizeMultiplier={1.3}
    >
      {badge}
    </Text>
  );
}

/**
 * Labeled navigation bar destination: icon, label below and the dock's 4dp accent dot under the
 * selected one. Like the icon dock, selection is text contrast and the dot, never a filled pill.
 */
function BarItem({
  label,
  accessibleLabel = label,
  focused,
  icon,
  badge,
  onPress,
  onLongPress,
  fixedWidth = false,
  largeLabel = false,
}: {
  /** Destination slot with a fixed width (floating capsule) instead of sharing a stretched bar. */
  fixedWidth?: boolean;
  /** One type step above caption, for the wider tablet dock. */
  largeLabel?: boolean;
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
    <AnimatedPressable
      pressScale={1}
      pressOpacity={reducedMotion ? 1 : opacity.pressed}
      accessibilityRole="tab"
      accessibilityLabel={accessibleLabel}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        ...(fixedWidth ? { width: metrics.tabletRailWidth } : { flex: 1 }),
        minHeight: metrics.touchTarget + space.md,
        alignItems: "center",
        justifyContent: "flex-start",
        paddingVertical: space.sm,
        gap: space.xxs,
      }}
    >
      <View
        style={{
          width: metrics.touchTarget + space.sm,
          height: metrics.touchTarget - space.md,
          borderRadius: radii.pill,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
        {badge ? <TabBadge badge={badge} top={0} end={space.xs} /> : null}
      </View>
      <Text
        accessible={false}
        numberOfLines={2}
        style={{
          color: focused ? colors.text : colors.muted,
          fontSize: largeLabel ? fontSize.small : fontSize.caption,
          fontWeight: focused ? "600" : "400",
          maxWidth: "100%",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      {/* The slot keeps its height when unselected, so labels do not shift with selection. */}
      <View
        accessible={false}
        style={{ width: space.xs, height: space.xs, borderRadius: radii.pill, backgroundColor: focused ? colors.accent : "transparent" }}
      />
    </AnimatedPressable>
  );
}

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
        {badge ? <TabBadge badge={badge} top={-space.sm} end={-space.xs} /> : null}
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
  const { width, height, fontScale } = useWindowDimensions();
  const navigationStyle = useAppearance((s) => s.navigationStyle);
  const bar = Platform.OS === "android" && navigationStyle === "bar";
  // Tablets and landscape large phones get labeled destinations in a wider dock.
  const wide = wideDock(width, height);
  const labeled = bar || wide;
  const keyboard = useKeyboardState((s) => s.isVisible);
  const [more, setMore] = useState(false);
  const available = Math.min(
    wide ? metrics.wideDockWidth : metrics.contentWidth,
    width - Math.max(insets.left, space.xs) - Math.max(insets.right, space.xs),
  );
  // The new-session command follows the destinations after a plain gap; the voice assistant lives
  // in the tab page's title row, not in the dock.
  const commandWidth = quickAction ? metrics.touchTarget + space.sm : 0;
  // Icon-only phone items are a fixed 48 pt target whatever the text size; only labeled items
  // grow with text, so only they budget by fontScale. Large text keeps all five phone destinations.
  const slots = Math.max(
    1,
    Math.floor(
      (available - space.sm * 2 - 2 - commandWidth) /
        ((wide && !bar ? metrics.tabletRailWidth : metrics.touchTarget) * (labeled ? Math.max(1, fontScale) : 1)),
    ),
  );
  const overflow = slots < state.routes.length;
  const shown = overflow ? state.routes.slice(0, slots - 1) : state.routes;
  const hidden = overflow ? state.routes.slice(slots - 1) : [];
  // Toasts and the floating assistant clear the rendered navigation footprint.
  useEffect(() => {
    if (keyboard) onInsetChange?.(0);
    // A resize or preference change can remove the overflow while its sheet is open.
    if (keyboard || !overflow) setMore(false);
  }, [keyboard, onInsetChange, overflow]);
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
  const hiddenCounts = hiddenBadges
    .map((route) => String(descriptors[route.key]!.options.tabBarBadge))
    .filter((value) => value !== TAB_BADGE_DOT);
  const overflowBadge = hiddenCounts.join(", ") || (hiddenBadges.length ? TAB_BADGE_DOT : undefined);
  const navigate = (route: (typeof state.routes)[number]) => {
    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    setMore(false);
    if (state.routes[state.index]?.key !== route.key) {
      haptic.select();
      navigateToTab(route.key);
    }
  };
  const Item = labeled ? BarItem : TabItem;
  const itemProps = labeled ? { fixedWidth: !bar, largeLabel: wide } : {};
  if (keyboard) return null;
  return (
    <>
      <View
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) => onInsetChange?.(layout.height)}
        style={{
          flexShrink: 0,
          paddingStart: Math.max(I18nManager.isRTL ? insets.right : insets.left, space.xs),
          paddingEnd: Math.max(I18nManager.isRTL ? insets.left : insets.right, space.xs),
          paddingTop: bar ? 0 : space.xs,
          paddingBottom: bar ? insets.bottom : Math.max(insets.bottom, space.xs),
          ...(bar ? { backgroundColor: colors.panel, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null),
        }}
      >
        <View
          style={{
            alignSelf: bar ? "stretch" : "center",
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: bar ? "transparent" : colors.panel,
            borderColor: bar ? "transparent" : colors.border,
            borderWidth: bar ? 0 : 1,
            borderRadius: bar ? 0 : radii.composer,
            padding: bar ? 0 : space.sm,
            shadowColor: colors.scrim,
            shadowOffset: { width: 0, height: space.xs },
            shadowOpacity: bar ? 0 : 0.18,
            shadowRadius: space.sm,
            elevation: bar ? 0 : 4,
          }}
        >
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              flex: bar ? 1 : undefined,
            }}
          >
            {shown.map((route) => {
              const options = descriptors[route.key]!.options;
              const focused = state.routes[state.index]?.key === route.key;
              return (
                <Item
                  key={route.key}
                  {...itemProps}
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
              <Item
                label={moreLabel}
                {...itemProps}
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
          {quickAction ? <View style={{ width: space.sm }} /> : null}
          {quickAction ? (
              <AnimatedPressable
                pressScale={1}
                pressOpacity={reducedMotion ? 1 : opacity.pressed}
                accessibilityRole="button"
                accessibilityLabel={quickAction.label}
                onPress={quickAction.onPress}
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
          ) : null}
        </View>
      </View>
      {more && overflow ? (
        <Sheet
          visible
          title={moreLabel}
          size="compact"
          onClose={() => setMore(false)}
        >
          {hidden.map((route) => {
            const options = descriptors[route.key]!.options;
            const selected = state.routes[state.index]?.key === route.key;
            const badge = options.tabBarBadge;
            return (
              <NavigationRow
                key={route.key}
                label={String(label(route))}
                accessibilityLabel={String(badgeLabel(route))}
                intent="navigate"
                icon={options.tabBarIcon?.({ focused: selected, color: selected ? colors.text : colors.muted, size: iconSize.row })}
                trailing={
                  badge === TAB_BADGE_DOT ? (
                    <View
                      accessible={false}
                      style={{ width: space.row, height: space.row, borderRadius: radii.pill, backgroundColor: colors.accentSolid }}
                    />
                  ) : badge ? (
                    <Text
                      accessible={false}
                      style={{ color: colors.text, fontSize: fontSize.caption, fontVariant: ["tabular-nums"] }}
                    >
                      {String(badge)}
                    </Text>
                  ) : undefined
                }
                selected={selected}
                onPress={() => navigate(route)}
              />
            );
          })}
        </Sheet>
      ) : null}
    </>
  );
}
