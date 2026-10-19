import { useLayoutEffect, type PropsWithChildren } from "react";
import { useColorScheme, View } from "react-native";
import { PortalHost, PortalProvider } from "panelui-native/primitives/portal";
import { ToastViewport } from "panelui-native/components/toast";
import { Uniwind } from "uniwind";
import { applyMobileTheme, colors } from "./tokens";
import { useMobileTheme } from "./theme";
import { useAppearance } from "../state/appearance";
import { useSecurity } from "../state/security";

/** Theme must also reach the initial lock/sign-in screen, before private providers mount. */
export function MobileThemeController() {
  const requested = useAppearance((state) => state.themeMode);
  const device = useColorScheme();
  const resolved = requested === "system" ? (device === "light" ? "light" : "dark") : requested;
  useLayoutEffect(() => {
    applyMobileTheme(resolved);
    Uniwind.setTheme(requested);
  }, [requested, resolved]);
  return null;
}

/** Compose public upstream providers with our existing private overlay boundary. */
export function BycodaUIProvider({ children }: PropsWithChildren) {
  const unlocked = useSecurity((state) => state.status === "unlocked");
  useMobileTheme();
  return (
    <PortalProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {children}
        {/* Keep the established native keyboard/gesture roots and lock boundary.
            The private portal host disappears on lock without clearing drafts. */}
        {unlocked ? (
          <>
            <PortalHost />
            <ToastViewport />
          </>
        ) : null}
      </View>
    </PortalProvider>
  );
}
