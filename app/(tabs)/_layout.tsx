import { Tabs, usePathname } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Inbox from "lucide-react-native/icons/inbox";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import Settings from "lucide-react-native/icons/settings";
import MessagesSquare from "lucide-react-native/icons/messages-square";
import { View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MachineHealthMonitor, MachinePill } from "../../src/ui/machine-bar";
import { colors } from "../../src/ui/tokens";
import { useCopy } from "../../src/ui/copy";
import { useMachines } from "../../src/state/machines";
import { ScreenChromeProvider } from "../../src/ui/layout";
import { FloatingTabBar } from "../../src/ui/floating-tab-bar";
import { useMobileTheme } from "../../src/ui/theme";
import { useProjectActivity } from "../../src/features/workspace/use-project-activity";
import type { ComponentType } from "react";

type IconProps = { color: ColorValue; focused: boolean };
const icon = (Glyph: ComponentType<{ color: string; size: number; strokeWidth: number }>) =>
  function TabIcon({ color, focused }: IconProps) {
    return <Glyph color={String(color)} size={22} strokeWidth={focused ? 2.1 : 1.8} />;
  };

export default function TabsLayout() {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const machineId = useMachines((s) => s.activeId);
  const firstConnection = useMachines(
    (s) => s.hydrated && !s.storageError && s.machines.length === 0,
  );
  const isWelcome = usePathname() === "/" && firstConnection;
  const activity = useProjectActivity();
  const running = machineId && activity.complete ? activity.sessions.length : 0;
  return (
    <ScreenChromeProvider
      bottomSafeArea={false}
      headerAccessory={!isWelcome && machineId ? <MachinePill /> : undefined}
    >
      {machineId ? <MachineHealthMonitor /> : null}
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
        <Tabs
          key={machineId}
          tabBar={(props) => <FloatingTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: copy("Projeler", "Projects"), tabBarIcon: icon(FolderGit2) }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: copy("Oturumlar", "Sessions"),
              tabBarIcon: icon(MessagesSquare),
              tabBarBadge: running ? (running > 99 ? "99+" : running) : undefined,
            }}
          />
          <Tabs.Screen
            name="inbox"
            options={{ title: copy("Gelen kutusu", "Inbox"), tabBarIcon: icon(Inbox) }}
          />
          <Tabs.Screen
            name="manage"
            options={{ title: copy("Araçlar", "Tools"), tabBarIcon: icon(LayoutGrid) }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: copy("Ayarlar", "Settings"), tabBarIcon: icon(Settings) }}
          />
        </Tabs>
      </View>
    </ScreenChromeProvider>
  );
}
