import { Tabs, usePathname } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Inbox from "lucide-react-native/icons/inbox";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Settings from "lucide-react-native/icons/settings";
import { Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MachineBar } from "../../src/ui/machine-bar";
import { colors, fontSize, metrics, radii, space } from "../../src/ui/tokens";
import { useCopy } from "../../src/ui/copy";
import { useMachines } from "../../src/state/machines";
import { ScreenChromeProvider } from "../../src/ui/layout";
import { NavigationIcon } from "../../src/ui/navigation-icon";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const copy = useCopy();
  const machineId = useMachines((s) => s.activeId);
  const firstConnection = useMachines(
    (s) => s.hydrated && !s.storageError && s.machines.length === 0,
  );
  const isWelcome = usePathname() === "/" && firstConnection;
  return (
    <ScreenChromeProvider bottomSafeArea={false}>
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
        {!isWelcome ? <MachineBar /> : null}
        <Tabs
          key={machineId}
          screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
            tabBarStyle: {
              backgroundColor: colors.background,
              borderTopColor: colors.separator,
              height: metrics.tabBarHeight + Math.max(0, (fontScale - 1) * 24) + insets.bottom,
              paddingTop: space.xs,
              paddingBottom: insets.bottom,
              paddingHorizontal: Math.max(insets.left, insets.right),
            },
            tabBarActiveTintColor: colors.accent,
            tabBarActiveBackgroundColor: "transparent",
            tabBarItemStyle: {
              borderRadius: radii.control,
              marginHorizontal: space.xs,
              marginTop: space.xs,
              marginBottom: space.xs,
            },
            tabBarInactiveTintColor: colors.muted,
            sceneStyle: { backgroundColor: colors.background },
            tabBarLabelStyle: { fontSize: fontSize.caption, lineHeight: 16, flexShrink: 0 },
            tabBarLabel: ({ color, children }) => (
              <Text
                numberOfLines={2}
                style={{
                  color,
                  fontSize: fontSize.micro,
                  lineHeight: 16,
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {children}
              </Text>
            ),
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: copy("Projeler", "Projects"),
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon focused={focused}>
                  <FolderGit2 color={color} size={21} strokeWidth={1.7} />
                </NavigationIcon>
              ),
            }}
          />
          <Tabs.Screen
            name="inbox"
            options={{
              title: copy("Gelen kutusu", "Inbox"),
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon focused={focused}>
                  <Inbox color={color} size={21} strokeWidth={1.7} />
                </NavigationIcon>
              ),
            }}
          />
          <Tabs.Screen
            name="manage"
            options={{
              title: copy("Yönet", "Manage"),
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon focused={focused}>
                  <SlidersHorizontal color={color} size={21} strokeWidth={1.7} />
                </NavigationIcon>
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: copy("Ayarlar", "Settings"),
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon focused={focused}>
                  <Settings color={color} size={21} strokeWidth={1.7} />
                </NavigationIcon>
              ),
            }}
          />
        </Tabs>
      </View>
    </ScreenChromeProvider>
  );
}
