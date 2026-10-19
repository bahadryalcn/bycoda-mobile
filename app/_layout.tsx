import "../src/global.css";
import { Stack } from "expo-router/stack";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { AppProviders } from "../src/app-providers";
import { colors, fontSize } from "../src/ui/tokens";
import { ScreenChromeProvider } from "../src/ui/layout";
import { useCopy } from "../src/ui/copy";
import { useReducedMotionPreference } from "../src/ui/use-reduced-motion";
import { useMobileTheme } from "../src/ui/theme";
import { useEffect } from "react";

function RootNavigation() {
  const copy = useCopy();
  const reducedMotion = useReducedMotionPreference();
  const { mode } = useMobileTheme();
  const baseTheme = mode === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
  return (
    <ThemeProvider value={navigationTheme}>
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
            <Stack.Screen name="tools/[tool]" options={{ title: copy("Araçlar", "Tools") }} />
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
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const { mode } = useMobileTheme();
  const barStyle = mode === "dark" ? "light" : "dark";
  const background = colors.background;
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    // This remains mounted while locked, including changes to the device theme.
    void SystemUI.setBackgroundColorAsync(background).catch(() => {
      console.warn("The native root background could not be updated.");
    });
  }, [background]);
  return (
    <>
      <AppProviders><RootNavigation /></AppProviders>
      {/* Expo Go owns the native plist; use one global status bar owner instead of native-stack traits. */}
      <StatusBar style={barStyle} />
      {process.env.EXPO_OS === "android" ? <NavigationBar style={barStyle} hidden={false} /> : null}
    </>
  );
}
