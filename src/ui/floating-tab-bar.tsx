import { Fragment, useEffect, useState } from "react";
import type { ComponentProps, ComponentRef, ReactNode, RefObject } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Plus from "lucide-react-native/icons/plus";
import { androidBlurProps, canBlurHere } from "panelui-native/primitives/scrim";
import { useKeyboardState } from "react-native-keyboard-controller";
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileTheme } from "./theme";
import { fontSize, metrics, opacity, radii, space } from "./tokens";
import { haptic } from "./motion";

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Instance type of the view that wraps the scene (the Android blur target). */
export type BlurTargetRef = RefObject<ComponentRef<typeof View> | null>;

export type DockAction = {
  /** Accessibility label; the circle shows only the icon. */
  label: string;
  onPress: () => void;
  /** Secondary action on a long press (the voice assistant). */
  onLongPress?: () => void;
  longPressLabel?: string;
  disabled?: boolean;
  /** Defaults to a Plus glyph. */
  icon?: ReactNode;
};

export type FloatingTabBarProps = TabBarProps & {
  /** Raised round primary action in the middle of the bar; omitted when there is nothing to start. */
  action?: DockAction;
  /** View that wraps the scene; Android samples it for the real blur. */
  blurTarget?: BlurTargetRef;
  /** Total dock height (capsule, margins, bottom inset); 0 while hidden. */
  onInsetChange?: (height: number) => void;
};

/** iOS "Reduce Transparency": the dock keeps its opaque surface instead of blurring. */
function useReduceTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (value) => {
      setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

const fill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Glass capsule/circle: real blur behind a translucent tint, or an opaque token surface. */
function GlassSurface({
  blurTarget,
  blurred,
  style,
  children,
}: {
  blurTarget?: BlurTargetRef;
  blurred: boolean;
  style: ComponentProps<typeof View>["style"];
  children: ReactNode;
}) {
  const { mode, colors } = useMobileTheme();
  return (
    <View
      style={[
        {
          backgroundColor: blurred ? "transparent" : colors.elevated,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: colors.scrim,
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        style,
      ]}
    >
      {blurred ? (
        <View pointerEvents="none" style={[fill, { borderRadius: radii.composer, overflow: "hidden" }]}>
          <BlurView
            tint={mode === "dark" ? "dark" : "light"}
            intensity={50}
            {...(androidBlurProps(blurTarget as Parameters<typeof androidBlurProps>[0]) as { blurMethod?: "dimezisBlurViewSdk31Plus"; blurTarget?: BlurTargetRef })}
            style={fill}
          />
          <View style={[fill, { backgroundColor: colors.glass }]} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** How far the action rises above the bar; the wrapper owns this height so the whole circle stays tappable. */
const ORB_LIFT = metrics.dockActionSize / 2;
/** Tab labels stay one line beside five siblings; the full name is always spoken. */
const LABEL_SCALE_CAP = 1.3;

function TabItem({
  label,
  focused,
  badge,
  icon,
  onPress,
  onLongPress,
}: {
  label: string;
  focused: boolean;
  badge?: string | number;
  icon: ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useMobileTheme();
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
          flex: 1,
          minWidth: 0,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          gap: space.xxs,
        },
        pressed && { opacity: opacity.pressed },
      ]}
    >
      <View>
        {icon}
        {badge ? (
          <View
            style={{
              position: "absolute",
              top: -6,
              start: 12,
              minWidth: 17,
              minHeight: 17,
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
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={LABEL_SCALE_CAP}
        style={{
          maxWidth: "100%",
          color: focused ? colors.text : colors.muted,
          fontSize: fontSize.micro,
          lineHeight: 14,
          fontWeight: focused ? "700" : "600",
        }}
      >
        {label}
      </Text>
      {/* The selected light: a short glowing bar. Siblings keep the same slot so nothing shifts. */}
      <View
        accessible={false}
        style={{
          width: space.lg,
          height: 3,
          borderRadius: radii.pill,
          backgroundColor: focused ? colors.accent : "transparent",
          shadowColor: colors.accent,
          shadowOpacity: focused ? 0.9 : 0,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </Pressable>
  );
}

/** Raised accent orb: gradient fill, soft halo and an accent glow. */
function DockActionButton({ action }: { action: DockAction }) {
  const { colors } = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: !!action.disabled }}
      disabled={action.disabled}
      onPress={() => {
        haptic.select();
        action.onPress();
      }}
      onLongPress={action.onLongPress ? () => { haptic.select(); action.onLongPress!(); } : undefined}
      accessibilityActions={action.onLongPress && action.longPressLabel ? [{ name: "longpress", label: action.longPressLabel }] : undefined}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "longpress") action.onLongPress?.(); }}
      style={({ pressed }) => [
        {
          width: metrics.dockActionSize + space.sm,
          height: metrics.dockActionSize + space.sm,
          alignItems: "center",
          justifyContent: "center",
          opacity: action.disabled ? opacity.disabled : 1,
        },
        pressed && { opacity: opacity.pressed },
      ]}
    >
      {/* Soft halo instead of a hard ring: the orb straddles the bar and the page, so no single ring colour fits both. */}
      <View
        accessible={false}
        pointerEvents="none"
        style={[fill, { borderRadius: radii.pill, backgroundColor: colors.accent, opacity: 0.16 }]}
      />
      <View
        style={{
          width: metrics.dockActionSize,
          height: metrics.dockActionSize,
          borderRadius: radii.pill,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accentSolid,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.accent,
          shadowColor: colors.accent,
          shadowOpacity: 0.6,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 10,
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[colors.accent, colors.accentSolid]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={fill}
        />
        {action.icon ?? <Plus color={colors.primaryText} size={26} strokeWidth={2.4} />}
      </View>
    </Pressable>
  );
}

/**
 * Floating "orbit" dock: one glass bar that never changes size or position, five labelled tabs
 * (the selected one lit), and an optional raised action in the middle.
 */
export function FloatingTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  action,
  blurTarget,
  onInsetChange,
}: FloatingTabBarProps) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardState((s) => s.isVisible);
  const reduceTransparency = useReduceTransparency();
  const blurred = canBlurHere && !reduceTransparency;
  useEffect(() => {
    if (keyboard) onInsetChange?.(0);
  }, [keyboard, onInsetChange]);
  useEffect(() => () => onInsetChange?.(0), [onInsetChange]);
  if (keyboard) return null;
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => onInsetChange?.(layout.height);
  const lift = action ? ORB_LIFT : 0;
  // The action owns a slot after the second tab; an overlay row with the same flex layout places
  // the raised orb exactly over that slot.
  const split = Math.min(1, state.routes.length - 1);
  const slot = metrics.dockActionSize + space.sm;
  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        start: 0,
        end: 0,
        bottom: 0,
        paddingTop: space.xs,
        paddingBottom: Math.max(insets.bottom, metrics.dockMargin),
        paddingStart: Math.max(insets.left, metrics.dockMargin),
        paddingEnd: Math.max(insets.right, metrics.dockMargin),
        alignItems: "center",
      }}
    >
      <View
        pointerEvents="box-none"
        style={{ width: "100%", maxWidth: metrics.contentWidth, height: metrics.tabBarHeight + space.xs + lift }}
      >
        <GlassSurface
          blurTarget={blurTarget}
          blurred={blurred}
          style={{ position: "absolute", start: 0, end: 0, bottom: 0, height: metrics.tabBarHeight + space.xs, borderRadius: radii.composer }}
        >
          <View
            accessibilityRole="tablist"
            style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs }}
          >
            {state.routes.map((route, index) => {
              const options = descriptors[route.key]!.options;
              const focused = state.index === index;
              const label = typeof options.title === "string" ? options.title : route.name;
              const color = focused ? colors.accent : colors.muted;
              return (
                <Fragment key={route.key}>
                  <TabItem
                    label={label}
                    focused={focused}
                    badge={options.tabBarBadge as string | number | undefined}
                    icon={options.tabBarIcon?.({ focused, color, size: 22 })}
                    onPress={() => {
                      const event = emitter.emit({
                        type: "tabPress",
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (!focused && !event.defaultPrevented) {
                        haptic.select();
                        navigateToTab(route.key);
                      }
                    }}
                    onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
                  />
                  {action && index === split ? (
                    <View accessible={false} style={{ width: slot }} />
                  ) : null}
                </Fragment>
              );
            })}
          </View>
        </GlassSurface>
        {action ? (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", start: 0, end: 0, top: 0, flexDirection: "row", paddingHorizontal: space.xs + StyleSheet.hairlineWidth }}
          >
            <View pointerEvents="none" style={{ flex: split + 1 }} />
            <DockActionButton action={action} />
            <View pointerEvents="none" style={{ flex: state.routes.length - split - 1 }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
