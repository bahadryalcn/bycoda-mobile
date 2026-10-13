import { useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SecurityGate } from "./features/security/app-lock";
import { AppLifecycle } from "./app-lifecycle";
import { ProviderConsentGate } from "./features/privacy/provider-consent";
import { OverlayProvider } from "./ui/overlays";
import { colors } from "./ui/tokens";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BycodaUIProvider } from "./ui/provider";

export function AppProviders({ children }: PropsWithChildren) {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            networkMode: "always",
            gcTime: 300_000,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <QueryClientProvider client={cache}>
          <AppLifecycle cache={cache}>
            <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
              <SecurityGate>
                <BycodaUIProvider>
                  <OverlayProvider>
                    <ProviderConsentGate>{children}</ProviderConsentGate>
                  </OverlayProvider>
                </BycodaUIProvider>
              </SecurityGate>
            </KeyboardProvider>
          </AppLifecycle>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
