import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { DockIcon, type DockIconName } from "../../ui/dock-icon";
import { useCopy } from "../../ui/copy";
import { useMobileTheme } from "../../ui/theme";
import { fontSize, metrics, opacity, radii, space } from "../../ui/tokens";
import { haptic } from "../../ui/motion";
import { useReducedMotionPreference } from "../../ui/use-reduced-motion";
import { useMachines } from "../../state/machines";
import { NewSessionSheet } from "./new-session-sheet";
import { useRunningSessionBadge } from "./tab-activity-bridge";

type RailRoute = "/" | "/chats" | "/inbox" | "/manage" | "/settings";

function RailButton({
  label,
  role,
  selected = false,
  badge,
  icon,
  onPress,
  onLongPress,
  hint,
  accent = false,
}: {
  accent?: boolean;
  label: string;
  role: "tab" | "button";
  selected?: boolean;
  badge?: string | number;
  icon: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  return (
    <AnimatedPressable
      pressScale={1}
      pressOpacity={reducedMotion ? 1 : opacity.pressed}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        width: metrics.touchTarget,
        height: metrics.touchTarget,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.control,
        backgroundColor: accent ? colors.accentSolid : selected ? colors.selected : "transparent",
      }}
    >
      {icon}
      {badge ? (
        <Text
          accessible={false}
          style={{
            position: "absolute",
            top: space.xs,
            end: space.xs,
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
    </AnimatedPressable>
  );
}

/** Vertical navigation rail that replaces the floating dock on wide tablets. Route-based and self-contained. */
export function TabletRail() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const machineId = useMachines((s) => s.activeId);
  const running = useRunningSessionBadge((s) => s.count);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const runningText = running > 99 ? "99+" : running;

  const items: { route: RailRoute; icon: DockIconName; label: string }[] = [
    { route: "/", icon: "projects", label: copy("Projeler", "Projects") },
    {
      route: "/chats",
      icon: "sessions",
      label: running
        ? copy("Oturumlar, {p0} çalışan oturum", "Sessions, {p0} running sessions", {
            p0: runningText,
          })
        : copy("Oturumlar", "Sessions"),
    },
    { route: "/inbox", icon: "inbox", label: copy("Gelen kutusu", "Inbox") },
    { route: "/manage", icon: "tools", label: copy("Araçlar", "Tools") },
  ];
  const isActive = (route: RailRoute) =>
    pathname === route || (route === "/chats" && pathname.startsWith("/session/"));
  const go = (route: RailRoute) => {
    if (isActive(route) && pathname === route) return;
    haptic.select();
    router.navigate(route);
  };
  const tab = ({ route, icon, label }: (typeof items)[number]) => (
    <RailButton
      key={route}
      role="tab"
      label={label}
      selected={isActive(route)}
      badge={route === "/chats" && running ? runningText : undefined}
      icon={<DockIcon name={icon} color={isActive(route) ? colors.text : colors.muted} />}
      onPress={() => go(route)}
    />
  );

  return (
    <View
      style={{
        width: metrics.touchTarget + space.sm * 2 + StyleSheet.hairlineWidth + insets.left,
        paddingTop: insets.top + space.sm,
        paddingBottom: Math.max(insets.bottom, space.sm),
        paddingStart: insets.left + space.sm,
        paddingEnd: space.sm,
        alignItems: "center",
        backgroundColor: colors.background,
        // Same hairline as the split list column, so rail, list and detail read as one frame.
        borderEndWidth: StyleSheet.hairlineWidth,
        borderEndColor: colors.separator,
      }}
    >
      <View accessibilityRole="tablist" style={{ gap: space.xs }}>
        {items.map(tab)}
      </View>
      {machineId ? (
        <View style={{ marginTop: space.md }}>
          <RailButton
            role="button"
            accent
            label={copy("Yeni oturum", "New session")}
            hint={copy("Sesli asistan", "Voice assistant")}
            icon={<DockIcon name="new-session" color={colors.primaryText} />}
            onPress={() => setNewSessionOpen(true)}
            // Holding the new-session button is the fastest way into a voice call, as on the phone dock.
            onLongPress={() => router.navigate({ pathname: "/assistant", params: { voice: "1" } })}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <RailButton
        role="tab"
        label={copy("Ayarlar", "Settings")}
        selected={pathname === "/settings"}
        icon={
          <DockIcon name="settings" color={pathname === "/settings" ? colors.text : colors.muted} />
        }
        onPress={() => go("/settings")}
      />
      {machineId ? (
        <NewSessionSheet visible={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
      ) : null}
    </View>
  );
}
