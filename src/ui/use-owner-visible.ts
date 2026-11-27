import { createContext, useContext } from "react";
import { useRouteFocus } from "./use-route-focus";
import { useSecurity } from "@/state/security";

/** True for the opened workspace while SecurityGate keeps it mounted but hidden behind the lock. */
export const HiddenContentContext = createContext(false);

/**
 * Whether this subtree can be seen right now: its route is focused, the app window is in front
 * and the lock is not covering it. Decorative loops stop when it is false.
 */
export function useOwnerVisible() {
  const focused = useRouteFocus();
  const hidden = useContext(HiddenContentContext);
  const foreground = useSecurity((state) => state.appState === "active" && state.windowFocused);
  return focused && foreground && !hidden;
}
