import { useLayoutEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import { useColorScheme, View } from "react-native";
import { PortalHost, PortalProvider } from "panelui-native/primitives/portal";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "./toast";
import { Uniwind } from "uniwind";
import { applyMobileTheme, uniwindThemeName } from "./tokens";
import { useMobileTheme } from "./theme";
import { useAppearance } from "../state/appearance";
import { useSecurity } from "../state/security";

/** Theme must also reach the initial lock/sign-in screen, before private providers mount. */
export function MobileThemeController() {
  const requested = useAppearance((state) => state.themeMode);
  const palette = useAppearance((state) => state.palette);
  const device = useColorScheme();
  const resolved = requested === "system" ? (device === "light" ? "light" : "dark") : requested;
  useLayoutEffect(() => {
    applyMobileTheme(resolved, palette);
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

/** PanelUI pins toasts to the safe-area bottom edge, so a dedicated portal host feeds it an inset that includes our chrome. */
function ToastLayer() {
  const insets = useSafeAreaInsets();
  const clearance = useSyncExternalStore(subscribeClearance, () => toastClearance, () => 0);
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
