import { useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router, type Href } from "expo-router";
import Animated from "react-native-reanimated";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import MessageSquare from "lucide-react-native/icons/message-square";
import Mic from "lucide-react-native/icons/mic";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import Terminal from "lucide-react-native/icons/terminal";
import X from "lucide-react-native/icons/x";
import { useAdaptiveLayout } from "@/ui/adaptive-layout";
import { useCopy } from "@/ui/copy";
import { dismiss, haptic, reveal, resize } from "@/ui/motion";
import { NavigationGroup, NavigationRow } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { metrics, opacity, radii, space } from "@/ui/tokens";
import { useMachines } from "@/state/machines";
import { isAppContentVisible } from "@/state/security";
import { useCommandPalette } from "../keyboard/keyboard-context";
import { appCommands } from "../keyboard/command-model";
import { recentQuickActionSessions } from "../widgets/model/quick-actions";
import { useWidgetFeedStore } from "../widgets/model/widget-feed";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import {
  QUICK_PANEL_RECENTS,
  QUICK_PANEL_WIDTH,
  quickPanelActions,
  quickPanelFrame,
  quickPanelMemory,
  quickPanelVisible,
  type QuickPanelAction,
} from "./tablet-quick-panel-model";

const icons: Record<QuickPanelAction["icon"], (color: string) => ReactNode> = {
  plus: (color) => <Plus size={18} color={color} />,
  mic: (color) => <Mic size={18} color={color} />,
  search: (color) => <Search size={18} color={color} />,
  terminal: (color) => <Terminal size={18} color={color} />,
  settings: (color) => <Settings size={18} color={color} />,
  message: (color) => <MessageSquare size={18} color={color} />,
};

/**
 * Tablet quick actions docked bottom-right: a round button that opens a short labeled list
 * (search, recent sessions, terminals; new session, voice and settings only where the rail lacks them). `bottomInset` is the
 * height of whatever the screen keeps at the bottom (dock or composer) that it must clear.
 */
export function TabletQuickPanel({ bottomInset }: { bottomInset: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const palette = useCommandPalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { tablet, hinge, tabletop } = useAdaptiveLayout();
  const machineId = useMachines((state) => state.activeId);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const feed = useWidgetFeedStore((state) => state.feed);
  const [open, setOpen] = useState(quickPanelMemory.read);
  const visible = quickPanelVisible({ tablet, keyboardVisible });
  const expanded = open && visible;
  const change = (next: boolean) => {
    quickPanelMemory.write(next);
    setOpen(next);
  };
  useKeyCommand({ key: "Escape", title: copy("Kapat", "Close"), enabled: expanded, priority: 50 }, () => change(false));
  if (!visible) return null;

  const frame = quickPanelFrame({
    width,
    height,
    insetRight: insets.right,
    insetTop: insets.top,
    bottomInset,
    hinge,
    tabletop,
  });
  // The rail is mounted with the panel on every tablet layout and already owns Settings, plus New session and
  // Voice assistant while a computer is active, so the panel keeps only what the rail cannot reach.
  const actions = quickPanelActions(
    appCommands(copy),
    recentQuickActionSessions(feed, true, QUICK_PANEL_RECENTS, copy("Yeni oturum", "New session")),
    copy,
    { session: Boolean(machineId) },
  );
  const run = (action: QuickPanelAction) => {
    change(false);
    if (!isAppContentVisible()) return;
    if (action.kind === "palette") palette.open();
    else if (action.kind === "route") router.navigate(action.destination as Href);
    else router.push(action.href as Href);
  };
  const label = expanded ? copy("Hızlı eylemleri kapat", "Close quick actions") : copy("Hızlı eylemler", "Quick actions");
  return (
    <>
      {expanded ? (
        <AnimatedPressable
          pressScale={1}
          pressOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={copy("Hızlı eylemleri kapat", "Close quick actions")}
          onPress={() => change(false)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: "flex-end", justifyContent: "flex-end", paddingRight: frame.right, paddingBottom: frame.bottom }]}>
        {expanded ? (
          <Animated.View
            entering={reveal}
            exiting={dismiss}
            layout={resize}
            style={{
              width: Math.min(QUICK_PANEL_WIDTH, frame.maxWidth),
              maxHeight: Math.max(0, frame.maxHeight - metrics.touchTarget - space.md),
              marginBottom: space.md,
              paddingVertical: space.xs,
              // Rows bring no side inset of their own; the floating card needs one so icons and labels clear its edge.
              paddingHorizontal: space.sm,
              overflow: "hidden",
              backgroundColor: colors.panel,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii.card,
              shadowColor: colors.scrim,
              shadowOffset: { width: 0, height: space.xs },
              shadowOpacity: 0.18,
              shadowRadius: space.md,
              elevation: 6,
            }}
          >
            <NavigationGroup>
              {actions.map((action) => (
                <NavigationRow
                  key={action.id}
                  compact
                  intent="command"
                  label={action.label}
                  icon={icons[action.icon](colors.muted)}
                  onPress={() => run(action)}
                />
              ))}
            </NavigationGroup>
          </Animated.View>
        ) : null}
        <AnimatedPressable
          pressScale={0.96}
          pressOpacity={opacity.pressed}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded }}
          onPress={() => {
            haptic.select();
            change(!expanded);
          }}
          style={{
            width: metrics.touchTarget + space.sm,
            height: metrics.touchTarget + space.sm,
            borderRadius: radii.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accentSolid,
            shadowColor: colors.scrim,
            shadowOffset: { width: 0, height: space.xs },
            shadowOpacity: 0.25,
            shadowRadius: space.sm,
            elevation: 6,
          }}
        >
          {expanded ? <X size={22} color={colors.primaryText} /> : <LayoutGrid size={22} color={colors.primaryText} />}
        </AnimatedPressable>
      </View>
    </>
  );
}
