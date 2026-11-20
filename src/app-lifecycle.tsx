import { useEffect } from "react";
import { AppState } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { flushQuestionAttachmentDrafts } from "./features/workspace/question-attachment-draft";
import { useMachines } from "./state/machines";
import { useSecurity } from "./state/security";
import { useAttachmentReleaseRetry } from "./state/queries";
import type { LifecycleProps } from "./app-types";
import { invalidateProjectPrivacy } from "./features/workspace/project-privacy-cache";
import { WidgetCoordinator } from "./features/widgets";
import { PushCoordinator } from "./features/push";

export function AppLifecycle({ children, cache }: LifecycleProps) {
  useAttachmentReleaseRetry();
  const hydrate = useMachines((s) => s.hydrate);
  const hydrated = useMachines((s) => s.hydrated);
  const activeId = useMachines((s) => s.activeId);
  const unlocked = useSecurity((s) => s.status === "unlocked");
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
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      useSecurity.getState().handleAppState(state);
      focusManager.setFocused(state === "active" && useSecurity.getState().status === "unlocked");
      if (state !== "active") {
        // iOS reports "inactive" for the notification shade, call banners and permission alerts; only
        // a real background cancels in-flight host reads. Lock still gates reads through the security state.
        if (state !== "inactive") void cache.cancelQueries({ queryKey: ["machine"] });
        void invalidateProjectPrivacy(cache);
        // The process may be suspended or killed: coalesced question text must reach disk first.
        void flushQuestionAttachmentDrafts(AsyncStorage);
      }
    });
    const blur =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => {
            useSecurity.getState().handleWindowFocus(false);
            focusManager.setFocused(false);
            void flushQuestionAttachmentDrafts(AsyncStorage);
            void cache.cancelQueries({ queryKey: ["machine"] });
          })
        : null;
    const focus =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("focus", () => {
            useSecurity.getState().handleWindowFocus(true);
            focusManager.setFocused(
              AppState.currentState === "active" && useSecurity.getState().status === "unlocked",
            );
          })
        : null;
    return () => {
      subscription.remove();
      blur?.remove();
      focus?.remove();
    };
  }, [cache]);
  useEffect(() => {
    focusManager.setFocused(
      unlocked &&
        (process.env.EXPO_OS === "web" ||
          (AppState.currentState === "active" && useSecurity.getState().windowFocused)),
    );
    if (!unlocked) { void cache.cancelQueries({ queryKey: ["machine"] }); void invalidateProjectPrivacy(cache); }
  }, [unlocked, cache]);
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
      {hydrated ? (
        <>
          <WidgetCoordinator />
          <PushCoordinator />
        </>
      ) : null}
      {children}
    </>
  );
}
