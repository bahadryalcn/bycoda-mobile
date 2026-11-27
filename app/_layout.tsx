import "../src/global.css";
import { Stack } from "expo-router/stack";
import { DarkTheme, DefaultTheme, ThemeProvider, router, type ErrorBoundaryProps } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { startDiagnostics } from "../src/features/diagnostics/diagnostics-runtime";
import { AppProviders } from "../src/app-providers";
import { KeyboardCommandsProvider, KeyboardScreen } from "../src/features/keyboard/keyboard-provider";
import { ScreenChromeProvider } from "../src/ui/layout";
import { ScreenComputerControl, ScreenHeaderRow } from "../src/ui/screen-chrome";
import { MachinePill } from "../src/ui/machine-bar";
import { HeaderBackButton } from "../src/ui/header-back-button";
import { stackBackItem } from "../src/ui/stack-back";
import { useCopy } from "../src/ui/copy";
import { useReducedMotionPreference } from "../src/ui/use-reduced-motion";
import { useMobileTheme } from "../src/ui/theme";
import { useRestoreLastSession } from "../src/features/workspace/last-session";
import { NavigationAnchor } from "../src/ui/navigation";
import { useAssistantWindowReserve } from "../src/features/assistant/assistant-window-reserve";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { AppErrorScreen } from "../src/ui/error-boundary";

/**
 * Home sits beneath every cold deep link (widget setup, `bycoda://project/...`, `/machines`,
 * a resolved session reference), so the header back arrow and the Android back button have
 * somewhere to go instead of leaving the app. Warm links and `router.push` keep their stack.
 */
export const unstable_settings = { anchor: "(tabs)" };

/** The switchable computer pill pages show in their shared scope row. */
function ComputerControl() {
  return <MachinePill />;
}

/**
 * A pushed page's one top row: Back, then its title and scope pills on the left, its icon actions
 * on the right. The native title is cleared so the page identity is not drawn twice.
 */
function HeaderRow({ identity, actions }: { identity: ReactNode; actions?: ReactNode }) {
  const back = <HeaderBackButton onPress={() => router.back()} />;
  // `null` returns a page that no longer fits the top row to the stack's own title and Back.
  if (identity === null) return (
    <Stack.Screen options={{
      headerTitle: undefined,
      headerLeft: ({ canGoBack }) => canGoBack ? back : null,
      unstable_headerLeftItems: ({ canGoBack }) => canGoBack ? [stackBackItem(back)] : [],
      headerRight: undefined,
    }} />
  );
  return (
    <Stack.Screen options={{
      headerTitle: "",
      headerLeft: ({ canGoBack }) => <View style={{ flexDirection: "row", alignItems: "center" }}>{canGoBack ? back : null}{identity}</View>,
      unstable_headerLeftItems: ({ canGoBack }) => [
        ...(canGoBack ? [stackBackItem(back)] : []),
        { type: "custom" as const, element: <>{identity}</>, hidesSharedBackground: true },
      ],
      headerRight: actions ? () => actions : undefined,
    }} />
  );
}

// Module scope: capture starts before the first render so early warnings and crashes are kept.
startDiagnostics();

/** A render crash anywhere below the root shows one compact recovery screen instead of a blank app. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorScreen {...props} />;
}

function RootNavigation() {
  useRestoreLastSession();
  const copy = useCopy();
  const reducedMotion = useReducedMotionPreference();
  const { mode, colors, uiStyles } = useMobileTheme();
  // Pushed screens keep their last rows and bottom actions clear of the minimized assistant window.
  const assistantReserve = useAssistantWindowReserve((state) => state.reserve);
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
        {/* A cold deep link's page gets its parent tab beneath it, so every Back lands there. */}
        <NavigationAnchor />
        <ScreenComputerControl value={ComputerControl}>
        <ScreenHeaderRow value={HeaderRow}>
        <ScreenChromeProvider nativeTitle bottomInset={assistantReserve}>
          <Stack
            screenLayout={({ children }) => <KeyboardScreen>{children}</KeyboardScreen>}
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              ...(process.env.EXPO_OS === "ios" ? { statusBarStyle: mode === "dark" ? "light" : "dark" } : {}),
              animation: reducedMotion ? "none" : "default",
              headerTintColor: colors.text,
              headerTitleStyle: uiStyles.title,
              headerBackButtonDisplayMode: "minimal",
              // One back presentation for every stack header; the native arrow is replaced, not mixed in.
              headerLeft: ({ canGoBack }) => canGoBack ? <HeaderBackButton onPress={() => router.back()} /> : null,
              // iOS: the same chevron as an item without the shared glass capsule (see stackBackItem).
              unstable_headerLeftItems: ({ canGoBack }) => canGoBack ? [stackBackItem(<HeaderBackButton onPress={() => router.back()} />)] : [],
              contentStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="machines"
              options={{ title: copy("Bilgisayarlar", "Computers"), presentation: "card" }}
            />
            <Stack.Screen name="account" options={{ title: copy("Hesap", "Account") }} />
            {/* `account-notifications` only redirects to settings/notifications. Every settings/* page
                sets its own title through SettingsPage, so this table lists none of them. */}
            <Stack.Screen name="project/[id]" options={{ title: copy("Proje", "Project") }} />
            {/* The chat screen draws its own compact 48dp header so the first frame never shifts. */}
            <Stack.Screen name="session/[id]" options={{ title: copy("Oturum", "Session"), headerShown: false }} />
            {/* One empty new session per stack: its draft is phone-wide, so a second copy (rail, ⌘N,
                palette from an open session above it) would hold a stale editor of the same draft.
                Opening it again brings the existing one to the front. */}
            <Stack.Screen
              name="session/new"
              dangerouslySingular
              options={{ title: copy("Yeni oturum", "New session"), headerShown: false }}
            />
            <Stack.Screen name="session-reference" options={{ title: copy("Oturum", "Session") }} />
            <Stack.Screen
              name="sessions"
              options={{ title: copy("Oturumlar", "Sessions") }}
            />
            <Stack.Screen name="manage/[section]" options={{ title: copy("Yönet", "Manage") }} />
            <Stack.Screen name="pull-requests/index" options={{ title: copy("Pull request’ler", "Pull requests") }} />
            <Stack.Screen name="pull-requests/[id]" options={{ title: copy("Pull request", "Pull request") }} />
            <Stack.Screen name="licenses" options={{ title: copy("Açık kaynak lisansları", "Open-source licenses") }} />
            <Stack.Screen name="tools/[tool]" options={{ title: copy("Araçlar", "Tools") }} />
            {/* The document screen names itself (Privacy, Terms or Help); no wrong placeholder meanwhile. */}
            <Stack.Screen name="legal/[document]" options={{ title: "" }} />
            <Stack.Screen
              name="demo"
              options={{ title: copy("Uygulamayı keşfet", "Explore the app") }}
            />
            <Stack.Screen
              name="report"
              options={{ title: copy("İçerik şikâyet et", "Report content") }}
            />
          </Stack>
        </ScreenChromeProvider>
        </ScreenHeaderRow>
        </ScreenComputerControl>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const { mode, colors } = useMobileTheme();
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
      <AppProviders><KeyboardCommandsProvider><RootNavigation /></KeyboardCommandsProvider></AppProviders>
      {process.env.EXPO_OS !== "ios" ? <StatusBar style={barStyle} /> : null}
      {process.env.EXPO_OS === "android" ? <NavigationBar style={barStyle} hidden={false} /> : null}
    </>
  );
}
