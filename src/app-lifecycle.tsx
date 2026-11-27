import { useEffect } from "react";
import { AppState } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { flushQuestionAttachmentDrafts } from "./features/workspace/question-attachment-draft";
import { useMachines } from "./state/machines";
import { useSecurity } from "./state/security";
import { useAttachmentReleaseRetry } from "./state/queries";
import { holdHostRecoveryClocks, resumeHostRecoveryClocks } from "./state/host-runtime-state";
import { createAppLifecycleController, hostQueriesFocused } from "./state/app-resume";
import type { LifecycleProps } from "./app-types";
import { invalidateProjectPrivacy } from "./features/workspace/project-privacy-cache";
import { WidgetCoordinator } from "./features/widgets";
import { PushCoordinator } from "./features/push";

export function AppLifecycle({ children, cache }: LifecycleProps) {
  useAttachmentReleaseRetry();
  const hydrate = useMachines((s) => s.hydrate);
  const hydrated = useMachines((s) => s.hydrated);
  const activeId = useMachines((s) => s.activeId);
  const status = useSecurity((s) => s.status);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(
    () =>
      NetInfo.addEventListener((network) => onlineManager.setOnline(network.isConnected !== false)),
    [],
  );
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    const focus = () => focusManager.setFocused(hostQueriesFocused(useSecurity.getState()));
    focus();
    // Screenshots, the notification shade, permission prompts and share sheets are no stay away:
    // see app-resume.ts. Only a long background expires privacy proof; nothing remounts or clears.
    const lifecycle = createAppLifecycleController(
      {
        holdClocks: holdHostRecoveryClocks,
        resumeClocks: resumeHostRecoveryClocks,
        cancelReads: () => void cache.cancelQueries({ queryKey: ["machine"] }),
        flushDrafts: () => void flushQuestionAttachmentDrafts(AsyncStorage),
        expirePrivacy: () => void invalidateProjectPrivacy(cache),
      },
      { initial: AppState.currentState },
    );
    const subscription = AppState.addEventListener("change", (state) => {
      // Clocks are held or restarted before the lock reacts and the socket reconnects.
      lifecycle.appState(state);
      useSecurity.getState().handleAppState(state);
      focus();
    });
    const blur =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => {
            useSecurity.getState().handleWindowFocus(false);
            lifecycle.windowBlur();
            focus();
          })
        : null;
    const regained =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("focus", () => {
            useSecurity.getState().handleWindowFocus(true);
            focus();
          })
        : null;
    return () => {
      subscription.remove();
      blur?.remove();
      regained?.remove();
      lifecycle.dispose();
    };
  }, [cache]);
  useEffect(() => {
    focusManager.setFocused(
      process.env.EXPO_OS === "web" ? status === "unlocked" : hostQueriesFocused(useSecurity.getState()),
    );
    if (status === "unlocked") return;
    void cache.cancelQueries({ queryKey: ["machine"] });
    // A suspension hides the mounted workspace behind the lock and keeps its proof, so a return within
    // the lock grace shows it as it was; a long stay away expires it through the lifecycle controller.
    if (status !== "suspended") void invalidateProjectPrivacy(cache);
  }, [status, cache]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: ["machine", activeId] });
    },
    [activeId, cache],
  );
  // Hydration no longer blocks the tree: the lock and account providers below start in parallel and
  // MachinesReadyGate holds back only the protected workspace until the saved computers are read.
  return (
    <>
      {hydrated ? <WidgetCoordinator /> : null}
      <PushCoordinator />
      {children}
    </>
  );
}
