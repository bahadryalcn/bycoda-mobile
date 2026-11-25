// @vitest-environment happy-dom
import { act, createContext, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AccountContext, useAccount, type AccountState } from "./features/account/ui/account-context";
import { AppProviders } from "./app-providers";
import { logDiagnostic } from "./features/diagnostics/diagnostic-log";
import { installMobileHostRuntime } from "./state/host-runtime";
import { useHostRuntimeStartupFailed } from "./state/host-runtime-state";
import { startRouteSelection } from "./state/route-selection-runtime";
import { ScreenOverlay } from "./ui/overlays";

const fixture = vi.hoisted(() => ({ status: "signedIn", overlayStatus: "", portalStatus: "" }));
vi.mock("./features/outbox/runtime/coordinator", () => ({ OutboxCoordinator: () => null }));
vi.mock("./features/assistant/assistant-companion", () => ({ AssistantCompanion: ({ children }: PropsWithChildren) => children }));
vi.mock("react-native", () => ({
  View: ({ children, ref }: PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) => createElement("div", { ref }, children),
  StyleSheet: { absoluteFill: {} },
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("section", null, children) },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
  Easing: { bezier: () => undefined },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: vi.fn() }));
vi.mock("panelui-native/hooks/use-back-handler", () => ({ useBackHandler: vi.fn() }));
vi.mock("expo-router/react-navigation", () => ({ NavigationContext: createContext(null) }));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: PropsWithChildren) => children }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardProvider: ({ children }: PropsWithChildren) => children,
  KeyboardController: { isVisible: () => false },
}));
vi.mock("./ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("./ui/motion", () => ({ motionTiming: {} }));
vi.mock("./features/outbox/runtime/draft-presence-reporter", () => ({ DraftPresenceReporter: () => null, draftPresenceConnected: vi.fn() }));
vi.mock("./ui/tokens", () => ({ motion: { sheet: 280 } }));
vi.mock("./ui/provider", () => ({
  MobileThemeController: () => null,
  BycodaUIProvider: ({ children }: PropsWithChildren) => {
    fixture.portalStatus = useAccount().status;
    return children;
  },
}));
vi.mock("./features/account/ui/AccountProvider", () => ({
  AccountProvider: ({ children }: PropsWithChildren) => createElement(AccountContext.Provider, {
    value: { status: fixture.status } as AccountState,
  }, children),
}));
vi.mock("./features/account/ui/AccountGate", () => ({ AccountGate: ({ children }: PropsWithChildren) => children }));
vi.mock("./features/privacy/provider-consent", () => ({ ProviderConsentGate: ({ children }: PropsWithChildren) => children }));
vi.mock("./features/security/app-lock", () => ({ SecurityGate: ({ children }: PropsWithChildren) => children }));
vi.mock("./app-lifecycle", () => ({ AppLifecycle: ({ children }: PropsWithChildren) => children }));
vi.mock("./app-machines-gate", () => ({ MachinesReadyGate: ({ children }: PropsWithChildren) => children }));
vi.mock("./state/security", () => ({
  useSecurity: Object.assign((select: (state: { status: string }) => unknown) => select({ status: "unlocked" }), {
    getState: () => ({ status: "unlocked" }),
  }),
}));
vi.mock("./state/machines", () => ({ useMachines: { getState: () => ({ machines: [] }), subscribe: () => () => undefined } }));
vi.mock("./features/diagnostics/diagnostic-log", () => ({ logDiagnostic: vi.fn() }));
vi.mock("./features/diagnostics/diagnostic-events", () => ({ transportKind: () => "fixture" }));
vi.mock("./features/diagnostics/DiagnosticsCoordinator", () => ({ DiagnosticsCoordinator: () => null }));
vi.mock("./features/diagnostics/DiagnosticSharingNotice", () => ({ DiagnosticSharingNotice: () => null }));
vi.mock("./features/legal/policy-update-notice", () => ({ PolicyUpdateNotice: () => null }));
vi.mock("./state/host-runtime", () => ({ installMobileHostRuntime: vi.fn() }));
vi.mock("./state/route-selection-runtime", () => ({ startRouteSelection: vi.fn() }));
vi.mock("./features/workspace/project-privacy-cache", () => ({
  observeProjectPrivacy: (cache: unknown) => cache,
  isProjectPrivacyQuery: () => false,
}));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  fixture.status = "signedIn";
  fixture.overlayStatus = "";
  fixture.portalStatus = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("publishes native startup rejection without exposing exception details", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("EXPO_OS", "android");
  vi.mocked(startRouteSelection).mockReturnValueOnce({
    runtimeState: vi.fn(),
    dispose: vi.fn(),
  });
  vi.mocked(installMobileHostRuntime).mockRejectedValueOnce(new Error("private module path"));
  const container = document.createElement("div");
  root = createRoot(container);
  function StartupStatus() {
    return useHostRuntimeStartupFailed() ? "startup failed" : "starting";
  }
  await act(async () => root!.render(createElement(AppProviders, null, createElement(StartupStatus))));
  expect(container.textContent).toContain("startup failed");
  expect(logDiagnostic).toHaveBeenCalledWith("warn", "mobile.host", "host runtime startup failed");
});

it("keeps account context available to portal roots and reparented privacy settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("EXPO_OS", "web");
  const container = document.createElement("div");
  root = createRoot(container);
  function PrivacyPanel() {
    fixture.overlayStatus = useAccount().status;
    return createElement("p", null, `Privacy settings: ${fixture.overlayStatus}`);
  }
  const content = createElement(ScreenOverlay, { visible: true, label: "Privacy and data", onClose: () => {}, children: createElement(PrivacyPanel) });
  await act(async () => root!.render(createElement(AppProviders, null, content)));
  expect(container.textContent).toContain("Privacy settings: signedIn");
  expect(fixture.portalStatus).toBe("signedIn");
  expect(fixture.overlayStatus).toBe("signedIn");

  fixture.status = "signedOut";
  await act(async () => root!.render(createElement(AppProviders, null, content)));
  expect(container.textContent).toContain("Privacy settings: signedOut");
  expect(fixture.portalStatus).toBe("signedOut");
});
