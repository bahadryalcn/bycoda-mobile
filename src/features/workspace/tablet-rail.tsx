import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import Mic from "lucide-react-native/icons/mic";
import { DockIcon, type DockIconName } from "../../ui/dock-icon";
import { useCopy } from "../../ui/copy";
import { useMobileTheme } from "../../ui/theme";
import { fontSize, metrics, opacity, radii, space } from "../../ui/tokens";
import { haptic } from "../../ui/motion";
import { useReducedMotionPreference } from "../../ui/use-reduced-motion";
import { useMachines } from "../../state/machines";
import { useAppPreferences } from "../navigation-prefs/app-preferences";
import type { DockTabId } from "../navigation-prefs/tab-preferences";
import { NewSessionSheet } from "./new-session-sheet";
import { useRunningSessionBadge } from "./tab-activity-bridge";

type RailRoute = "/" | "/chats" | "/inbox" | "/manage" | "/settings";

function RailButton({
  label,
  caption,
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
  /** Accessible name (may carry counts). */
  label: string;
  /** Short visible label under the icon; defaults to `label`. */
  caption?: string;
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
        width: metrics.tabletRailWidth - space.sm * 2,
        minHeight: metrics.touchTarget + space.md,
        paddingVertical: space.sm,
        alignItems: "center",
        justifyContent: "center",
        gap: space.xxs,
        borderRadius: radii.control,
        backgroundColor: accent ? colors.accentSolid : selected ? colors.selected : "transparent",
      }}
    >
      {icon}
      <Text
        accessible={false}
        numberOfLines={1}
        style={{
          color: accent ? colors.primaryText : selected ? colors.text : colors.muted,
          fontSize: fontSize.caption,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {caption ?? label}
      </Text>
      {badge ? (
        <Text
          accessible={false}
          style={{
            position: "absolute",
            top: space.xs,
            end: space.md,
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

  const { preferences } = useAppPreferences();
  const all: { id: DockTabId; route: RailRoute; icon: DockIconName; label: string; caption?: string }[] = [
    { id: "index", route: "/", icon: "projects", label: copy("Projeler", "Projects") },
    {
      id: "chats",
      route: "/chats",
      icon: "sessions",
      label: running
        ? copy("Oturumlar, {p0} çalışan oturum", "Sessions, {p0} running sessions", {
            p0: runningText,
          })
        : copy("Oturumlar", "Sessions"),
      caption: copy("Oturumlar", "Sessions"),
    },
    { id: "inbox", route: "/inbox", icon: "inbox", label: copy("Gelen kutusu", "Inbox") },
    { id: "manage", route: "/manage", icon: "tools", label: copy("Araçlar", "Tools") },
  ];
  // Same order and visibility as the phone dock; hidden tabs stay routable.
  const items = preferences.tabs.order
    .filter((id) => !preferences.tabs.hidden.includes(id))
    .flatMap((id) => all.filter((item) => item.id === id));
  const isActive = (route: RailRoute) =>
    pathname === route || (route === "/chats" && pathname.startsWith("/session/"));
  const go = (route: RailRoute) => {
    if (isActive(route) && pathname === route) return;
    haptic.select();
    router.navigate(route);
  };
  const openVoice = () => router.navigate({ pathname: "/assistant", params: { voice: "1" } });
  const tab = ({ route, icon, label, caption }: (typeof items)[number]) => (
    <RailButton
      key={route}
      role="tab"
      label={label}
      caption={caption}
      selected={isActive(route)}
      badge={route === "/chats" && running ? runningText : undefined}
      icon={<DockIcon name={icon} color={isActive(route) ? colors.text : colors.muted} />}
      onPress={() => go(route)}
    />
  );

  return (
    <View
      style={{
        width: metrics.tabletRailWidth + StyleSheet.hairlineWidth + insets.left,
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
        <View style={{ marginTop: space.md, gap: space.xs }}>
          <RailButton
            role="button"
            accent
            label={copy("Yeni oturum", "New session")}
            caption={copy("Yeni", "New")}
            hint={copy("Sesli asistan", "Voice assistant")}
            icon={<DockIcon name="new-session" color={colors.primaryText} />}
            onPress={() => setNewSessionOpen(true)}
            // Holding the new-session button is the fastest way into a voice call, as on the phone dock.
            onLongPress={openVoice}
          />
          <RailButton
            role="button"
            label={copy("Sesli asistan", "Voice assistant")}
            caption={copy("Sesli", "Voice")}
            icon={<Mic size={24} color={colors.muted} />}
            onPress={openVoice}
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
