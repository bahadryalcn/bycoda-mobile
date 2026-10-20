import { useCallback, useContext, useSyncExternalStore } from "react";
import { NavigationContext } from "expo-router/react-navigation";
import { useSecurity } from "@/state/security";
import { useReducedMotionPreference } from "./use-reduced-motion";

/** Feedback also renders during boot, above the navigator and before unlock. */
export function useFeedbackAnimation() {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((onChange: () => void) => {
    if (!navigation) return () => {};
    const focus = navigation.addListener("focus", onChange);
    const blur = navigation.addListener("blur", onChange);
    return () => { focus(); blur(); };
  }, [navigation]);
  const isFocused = useCallback(() => navigation?.isFocused() ?? true, [navigation]);
  const focused = useSyncExternalStore(subscribe, isFocused, isFocused);
  const foreground = useSecurity((state) => state.appState === "active" && state.windowFocused);
  const reducedMotion = useReducedMotionPreference();
  return focused && foreground && !reducedMotion;
}
