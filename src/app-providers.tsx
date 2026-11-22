import { useMobileTheme } from "@/ui/theme";
import { OutboxCoordinator } from "./features/outbox/runtime/coordinator";
import { DraftPresenceReporter, draftPresenceConnected } from "./features/outbox/runtime/draft-presence-reporter";
import { useEffect, useState, type PropsWithChildren } from "react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useMachines } from "./state/machines";
import { SecurityGate } from "./features/security/app-lock";
import { AppLifecycle } from "./app-lifecycle";
import { MachinesReadyGate } from "./app-machines-gate";
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
import { recordActiveHostMachine, recordHostRuntimeStartupFailed, recordHostRuntimeState } from "./state/host-runtime-state";
import { retryTransientRead, transientRetryDelay } from "./state/query-retry";
import { startRouteSelection } from "./state/route-selection-runtime";
import { observeProjectPrivacy } from "./features/workspace/project-privacy-cache";
import { createReconnectRefresh } from "./state/reconnect-refresh";
import { isAppAccessAllowed } from "./state/security";

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
  // Mirrors the selected computer for shared loading states, which must not import the machines store.
  useEffect(() => {
    recordActiveHostMachine(useMachines.getState().activeId ?? null);
    return useMachines.subscribe((state) => recordActiveHostMachine(state.activeId ?? null));
  }, []);
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    let disposed = false,
      release: (() => void) | undefined;
    const routes = startRouteSelection();
    const reconnect = createReconnectRefresh(cache, {
      canRun: () => focusManager.isFocused() && isAppAccessAllowed(),
    });
    void installMobileHostRuntime({
      onState: (machineId, state) => {
        routes.runtimeState(machineId, state);
        recordHostRuntimeState(machineId, state);
        if (state === "ready") draftPresenceConnected(machineId);
        else reconnect.cancel(machineId);
        const machine = useMachines.getState().machines.find((entry) => entry.id === machineId);
        logDiagnostic(state === "backoff" || state === "blocked" ? "warn" : "info", "mobile.host", "host connection", {
          state,
          transport: transportKind(machine),
        });
        // Debounced, staggered and focus-first: see reconnect-refresh.ts.
        if (state === "ready") reconnect.schedule(machineId);
      },
    })
      .then((installed) => {
        if (disposed) installed.dispose();
        else release = installed.dispose;
      })
      .catch(() => {
        if (disposed) return;
        logDiagnostic("warn", "mobile.host", "host runtime startup failed");
        recordHostRuntimeStartupFailed(true);
      });
    return () => {
      disposed = true;
      recordHostRuntimeStartupFailed(false);
      reconnect.dispose();
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
              {/* Account sits above the lock so Clerk loads while the user authenticates; only the
                  workspace inside SecurityGate (and the AccountGate that guards it) waits for unlock. */}
              <AccountProvider>
                <SecurityGate>
                  <MachinesReadyGate>
                    <BycodaUIProvider>
                      <OverlayProvider>
                        <OutboxCoordinator />
                        <DraftPresenceReporter />
                        <AccountGate><ProviderConsentGate><AssistantCompanion>{children}</AssistantCompanion></ProviderConsentGate></AccountGate>
                        <DiagnosticsCoordinator />
                      </OverlayProvider>
                    </BycodaUIProvider>
                  </MachinesReadyGate>
                </SecurityGate>
              </AccountProvider>
            </KeyboardProvider>
          </AppLifecycle>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
