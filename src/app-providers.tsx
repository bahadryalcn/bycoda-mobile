import { useMobileTheme } from "@/ui/theme";
import { OutboxCoordinator } from "./features/outbox/runtime/coordinator";
import { DraftPresenceReporter, draftPresenceConnected } from "./features/outbox/runtime/draft-presence-reporter";
import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useMachines } from "./state/machines";
import { SecurityGate } from "./features/security/app-lock";
import { AppLifecycle } from "./app-lifecycle";
import { AccountProvider } from "./features/account/ui/AccountProvider";
import { AccountGate } from "./features/account/ui/AccountGate";
import { AssistantCompanion } from "./features/assistant/assistant-companion";
import { logDiagnostic } from "./features/diagnostics/diagnostic-log";
import { transportKind } from "./features/diagnostics/diagnostic-events";
import { DiagnosticsCoordinator } from "./features/diagnostics/DiagnosticsCoordinator";
import { ProviderConsentGate } from "./features/privacy/provider-consent";
import { OverlayProvider } from "./ui/overlays";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BycodaUIProvider, MobileThemeController } from "./ui/provider";
import { installMobileHostRuntime } from "./state/host-runtime";
import { retryTransientRead, transientRetryDelay } from "./state/query-retry";
import { startRouteSelection } from "./state/route-selection-runtime";
import { isProjectPrivacyQuery, observeProjectPrivacy } from "./features/workspace/project-privacy-cache";

export function AppProviders({ children }: PropsWithChildren) {
  const { colors } = useMobileTheme();
  const [cache] = useState(
    () =>
      observeProjectPrivacy(new QueryClient({
        defaultOptions: {
          queries: {
            retry: retryTransientRead,
            retryDelay: transientRetryDelay,
            networkMode: "always",
            gcTime: 300_000,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false, networkMode: "always" },
        },
      })),
  );
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    let disposed = false,
      release: (() => void) | undefined;
    const routes = startRouteSelection();
    void installMobileHostRuntime({
      onState: (machineId, state) => {
        routes.runtimeState(machineId, state);
        if (state === "ready") draftPresenceConnected(machineId);
        const machine = useMachines.getState().machines.find((entry) => entry.id === machineId);
        logDiagnostic(state === "backoff" || state === "blocked" ? "warn" : "info", "mobile.host", "host connection", {
          state,
          transport: transportKind(machine),
        });
        if (state === "ready")
          void cache.invalidateQueries({
            queryKey: ["machine", machineId],
            predicate: ({ queryKey }) => !isProjectPrivacyQuery(queryKey),
          });
      },
    })
      .then((installed) => {
        if (disposed) installed.dispose();
        else release = installed.dispose;
      })
      .catch(() => {
        // Eligible socket calls report their explicit unsupported state. Existing
        // encrypted HTTP cohorts continue through the compatibility adapter.
      });
    return () => {
      disposed = true;
      routes.dispose();
      release?.();
    };
  }, [cache]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MobileThemeController />
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <QueryClientProvider client={cache}>
          <AppLifecycle cache={cache}>
            <KeyboardProvider>
              <SecurityGate>
                <AccountProvider>
                  <BycodaUIProvider>
                    <OverlayProvider>
                      <OutboxCoordinator />
                      <DraftPresenceReporter />
                      <AccountGate><ProviderConsentGate><AssistantCompanion>{children}</AssistantCompanion></ProviderConsentGate></AccountGate>
                      <DiagnosticsCoordinator />
                    </OverlayProvider>
                  </BycodaUIProvider>
                </AccountProvider>
              </SecurityGate>
            </KeyboardProvider>
          </AppLifecycle>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
