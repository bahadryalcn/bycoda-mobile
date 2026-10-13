import "../src/global.css";
import { Stack } from "expo-router/stack";
import { DarkTheme, ThemeProvider } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { AppProviders } from "../src/app-providers";
import { colors, fontSize } from "../src/ui/tokens";
import { ScreenChromeProvider } from "../src/ui/layout";
import { useCopy } from "../src/ui/copy";
import { useReducedMotionPreference } from "../src/ui/use-reduced-motion";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

// Edge-to-edge bars show the native root beneath React during startup/transitions.
if (process.env.EXPO_OS !== "web") {
  void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
    console.warn("The native root background could not be updated.");
  });
}

export default function RootLayout() {
  const copy = useCopy();
  const reducedMotion = useReducedMotionPreference();
  return (
    <ThemeProvider value={navigationTheme}>
      <AppProviders>
        <ScreenChromeProvider nativeTitle>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              animation: reducedMotion ? "none" : "default",
              headerTintColor: colors.text,
              headerTitleStyle: { fontSize: fontSize.title, fontWeight: "600" },
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              statusBarStyle: "light",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="machines"
              options={{ title: copy("Bilgisayarlar", "Computers"), presentation: "card" }}
            />
            <Stack.Screen name="project/[id]" options={{ title: copy("Proje", "Project") }} />
            <Stack.Screen name="session/[id]" options={{ title: copy("Oturum", "Session") }} />
            <Stack.Screen
              name="sessions"
              options={{ title: copy("Aktif oturumlar", "Active sessions") }}
            />
            <Stack.Screen name="manage/[section]" options={{ title: copy("Yönet", "Manage") }} />
            <Stack.Screen name="legal/[document]" options={{ title: copy("Yardım", "Help") }} />
            <Stack.Screen
              name="demo"
              options={{ title: copy("Uygulamayı keşfet", "Explore the app") }}
            />
            <Stack.Screen
              name="report"
              options={{ title: copy("İçerik bildir", "Report content") }}
            />
          </Stack>
        </ScreenChromeProvider>
      </AppProviders>
      <StatusBar style="light" />
      {process.env.EXPO_OS === "android" ? <NavigationBar style="light" hidden={false} /> : null}
    </ThemeProvider>
  );
}
