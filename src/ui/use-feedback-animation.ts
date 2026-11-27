import { useOwnerVisible } from "./use-owner-visible";
import { useReducedMotionPreference } from "./use-reduced-motion";

/** Feedback also renders during boot, above the navigator and before unlock; the workspace hidden behind the lock stays still. */
export function useFeedbackAnimation() {
  const visible = useOwnerVisible();
  const reducedMotion = useReducedMotionPreference();
  return visible && !reducedMotion;
}
