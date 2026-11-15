import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { NavigationContext } from "expo-router/react-navigation";

/** Portalled child sheets inherit their owning route, even outside the navigator. */
export const RouteFocusContext = createContext(true);

/** Global pre-navigation UI stays active; route-owned UI follows focus without dismissal. */
export function useRouteFocus() {
  const navigation = useContext(NavigationContext);
  const inherited = useContext(RouteFocusContext);
  // Navigation focus is read on subscription/events, never during render.
  const cached = useRef(true);
  const subscribe = useCallback((onChange: () => void) => {
    if (!navigation) { cached.current = true; onChange(); return () => {}; }
    const update = () => { cached.current = navigation.isFocused(); onChange(); };
    cached.current = navigation.isFocused();
    const focus = navigation.addListener("focus", update);
    const blur = navigation.addListener("blur", update);
    return () => { focus(); blur(); };
  }, [navigation]);
  const snapshot = useCallback(() => cached.current, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot) && inherited;
}
