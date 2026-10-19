import { useMobileTheme } from "@/ui/theme";
import { useEffect } from "react";
import { AppState, View } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { useMachines } from "./state/machines";
import { uiStyles } from "./ui/styles";
import { Loading } from "./ui/primitives";
import { useSecurity } from "./state/security";
import { useAttachmentReleaseRetry } from "./state/queries";
import type { LifecycleProps } from "./app-types";

export function AppLifecycle({ children, cache }: LifecycleProps) {
  useMobileTheme();
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
      if (state !== "active") void cache.cancelQueries({ queryKey: ["machine"] });
    });
    const blur =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => {
            useSecurity.getState().handleWindowFocus(false);
            focusManager.setFocused(false);
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
    if (!unlocked) void cache.cancelQueries({ queryKey: ["machine"] });
  }, [unlocked, cache]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: ["machine", activeId] });
    },
    [activeId, cache],
  );
  if (!hydrated)
    return (
      <View style={[uiStyles.screen, uiStyles.centered]}>
        <Loading label="bycoda" centered />
      </View>
    );
  return children;
}
