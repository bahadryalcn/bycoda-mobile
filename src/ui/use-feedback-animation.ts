import { useRouteFocus } from "./use-route-focus";
import { useSecurity } from "@/state/security";
import { useReducedMotionPreference } from "./use-reduced-motion";

/** Feedback also renders during boot, above the navigator and before unlock. */
export function useFeedbackAnimation() {
  const focused = useRouteFocus();
  const foreground = useSecurity((state) => state.appState === "active" && state.windowFocused);
  const reducedMotion = useReducedMotionPreference();
  return focused && foreground && !reducedMotion;
}
