import { useLayoutEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import { useColorScheme, View } from "react-native";
import { PortalHost, PortalProvider } from "panelui-native/primitives/portal";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "./toast";
import { Uniwind } from "uniwind";
import { applyMobileTheme, uniwindThemeName, resolveMobilePalette } from "./tokens";
import { themeColorRoles } from "./theme-color-roles";
import { useMobileTheme } from "./theme";
import { useAppearance } from "../state/appearance";
import { applyTypography } from "./typography-runtime";
import { useSecurity } from "../state/security";
import { useMaterialYouWallpaperRefresh } from "./theme-material-you";

/** Theme must also reach the initial lock/sign-in screen, before private providers mount. */
export function MobileThemeController() {
  const requested = useAppearance((state) => state.themeMode);
  const palette = useAppearance((state) => state.palette);
  const typography = useAppearance((state) => state.typography);
  // A new wallpaper changes Material You colours while the app is in the background.
  useMaterialYouWallpaperRefresh();
  // Apply saved text choices in place, including on the lock screen.
  useLayoutEffect(() => { applyTypography(typography); }, [typography]);
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

/** PanelUI pins toasts to the safe-area bottom edge, so a dedicated portal host feeds it an inset that includes our chrome. */
function ToastLayer() {
  const insets = useSafeAreaInsets();
  const clearance = useBottomChromeClearance();
  return (
    <PortalProvider>
      <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: insets.bottom + clearance }}>
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
  return (
    <PortalProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {children}
        {/* Keep the established native keyboard/gesture roots and lock boundary.
            The private portal host disappears on lock without clearing drafts. */}
        {unlocked ? (
          <>
            <PortalHost />
            <ToastLayer />
          </>
        ) : null}
      </View>
    </PortalProvider>
  );
}
