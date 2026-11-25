import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { PortalHost, PortalProvider } from "panelui-native/primitives/portal";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "./toast";
import { Uniwind } from "uniwind";
import { applyMobileTheme, uniwindThemeName, resolveMobilePalette, space } from "./tokens";
import { ToastCard, type ToastCardProps } from "./toast-card";
import { themeColorRoles } from "./theme-color-roles";
import { useMobileTheme } from "./theme";
import { useAppearance } from "../state/appearance";
import { applyTypography } from "./typography-runtime";
import { useSecurity } from "../state/security";
import { useMaterialYouWallpaperRefresh } from "./theme-material-you";
import { applyNativeColorScheme } from "./native-appearance";

/** Theme must also reach the initial lock/sign-in screen, before private providers mount. */
export function MobileThemeController() {
  const requested = useAppearance((state) => state.themeMode);
  const palette = useAppearance((state) => state.palette);
  const typography = useAppearance((state) => state.typography);
  // A new wallpaper changes Material You colours while the app is in the background.
  useMaterialYouWallpaperRefresh();
  // Apply saved text choices in place, including on the lock screen.
  useLayoutEffect(() => { applyTypography(typography); }, [typography]);
  // The status bar, keyboard, alerts and pickers follow the native window style, not our palette:
  // an explicit app theme overrides the device so the clock stays readable on a dark app in light mode.
  useLayoutEffect(() => { applyNativeColorScheme(requested); }, [requested]);
  const device = useColorScheme();
  const resolved = requested === "system" ? (device === "light" ? "light" : "dark") : requested;
  useLayoutEffect(() => {
    applyMobileTheme(resolved, palette);
    // Material You shares the base theme names. Restore their original roles when Classic is selected.
    if (palette === "material" || palette === "classic") {
      Uniwind.updateCSSVariables(resolved, Object.fromEntries(
        Object.entries(themeColorRoles(resolveMobilePalette(palette, resolved))).map(([key, value]) => [`--color-${key}`, value]),
      ));
    }
    // Custom Uniwind themes do not follow the device, so a palette uses the resolved mode;
    // classic keeps following the system setting itself.
    Uniwind.setTheme((palette === "classic" ? requested : uniwindThemeName(palette, resolved)) as Parameters<typeof Uniwind.setTheme>[0]);
  }, [requested, resolved, palette]);
  return null;
}

let toastClearance = 0;
const clearanceListeners = new Set<() => void>();
/** The tab shell reports the bottom chrome height so toasts clear it; 0 elsewhere. */
export function setToastClearance(height: number) {
  if (height === toastClearance) return;
  toastClearance = height;
  for (const listener of clearanceListeners) listener();
}
const subscribeClearance = (listener: () => void) => { clearanceListeners.add(listener); return () => { clearanceListeners.delete(listener); }; };

/** Measured tab chrome above the safe area, shared by floating overlays. */
export function useBottomChromeClearance() {
  return useSyncExternalStore(subscribeClearance, () => toastClearance, () => 0);
}

const ToastNoticeHeight = createContext<(height: number) => void>(() => {});
const ActionableToastHeight = createContext(0);

/** Clearance above the safe area for bottom actions that share the notice's viewport. */
export function useActionableToastClearance() {
  const height = useContext(ActionableToastHeight);
  return height > 0 ? height + space.screen : 0;
}

/** One app-level notice with actions that stay available while its owner presents it. */
export function ActionableToast(props: ToastCardProps) {
  const insets = useSafeAreaInsets();
  const clearance = useBottomChromeClearance();
  const setHeight = useContext(ToastNoticeHeight);
  useLayoutEffect(() => () => setHeight(0), [setHeight]);
  return (
    <KeyboardAvoidingView
      pointerEvents="box-none"
      behavior="padding"
      automaticOffset
      style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
    >
      <View
        pointerEvents="box-none"
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={{
          marginLeft: insets.left + space.screen,
          marginRight: insets.right + space.screen,
          marginBottom: insets.bottom + clearance + space.screen,
        }}
      >
        <ToastCard {...props} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Feed PanelUI an inset that clears measured chrome and the active notice. */
function ToastLayer({ noticeHeight }: { noticeHeight: number }) {
  const insets = useSafeAreaInsets();
  const clearance = useBottomChromeClearance();
  return (
    <PortalProvider>
      <SafeAreaInsetsContext.Provider value={{
        ...insets,
        bottom: insets.bottom + clearance + (noticeHeight > 0 ? noticeHeight + space.row : 0),
      }}>
        <PortalHost />
        <ToastHost />
      </SafeAreaInsetsContext.Provider>
    </PortalProvider>
  );
}

/** Compose public upstream providers with our existing private overlay boundary. */
export function BycodaUIProvider({ children }: PropsWithChildren) {
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const { colors } = useMobileTheme();
  const [noticeHeight, setNoticeHeight] = useState(0);
  return (
    <PortalProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ToastNoticeHeight.Provider value={setNoticeHeight}>
          <ActionableToastHeight.Provider value={noticeHeight}>{children}</ActionableToastHeight.Provider>
        </ToastNoticeHeight.Provider>
        {/* Keep the established native keyboard/gesture roots and lock boundary.
            The private portal host disappears on lock without clearing drafts. */}
        {unlocked ? (
          <>
            <PortalHost />
            <ToastLayer noticeHeight={noticeHeight} />
          </>
        ) : null}
      </View>
    </PortalProvider>
  );
}
