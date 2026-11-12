import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { NavigationContext } from "expo-router/react-navigation";
import { useSecurity } from "@/state/security";
import { useReducedMotionPreference } from "./use-reduced-motion";

/** Feedback also renders during boot, above the navigator and before unlock. */
export function useFeedbackAnimation() {
  const navigation = useContext(NavigationContext);
  // React Navigation warns when isFocused() is read while rendering (it can be stale there), so
  // the value is read when subscribing and on focus events, and render only reads the cached copy.
  const cached = useRef(true);
  const subscribe = useCallback((onChange: () => void) => {
    if (!navigation) return () => {};
    const update = () => {
      cached.current = navigation.isFocused();
      onChange();
    };
    cached.current = navigation.isFocused();
    const focus = navigation.addListener("focus", update);
    const blur = navigation.addListener("blur", update);
    return () => { focus(); blur(); };
  }, [navigation]);
  const isFocused = useCallback(() => cached.current, []);
  const focused = useSyncExternalStore(subscribe, isFocused, isFocused);
  const foreground = useSecurity((state) => state.appState === "active" && state.windowFocused);
  const reducedMotion = useReducedMotionPreference();
  return focused && foreground && !reducedMotion;
}
