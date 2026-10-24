import { useLayoutEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { View } from "react-native";
import { PrivateContentContext, usePrivateContentAccess, type PrivateContentAccess } from "./private-access";
export { PrivateContentAccessProvider, usePrivateContentAccess, usePrivateContentAllowed, type PrivateContentAccess } from "./private-access";

/** Conceal a workspace and its portals without replacing its mounted draft owner. */
export function PrivateContentBoundary({ visible, isAllowed, children }: PropsWithChildren<{ visible: boolean; isAllowed?: () => boolean }>) {
  const parent = usePrivateContentAccess();
  const current = useRef({ visible, isAllowed, parent, mounted: true });
  current.current = { ...current.current, visible, isAllowed, parent };
  useLayoutEffect(() => { current.current.mounted = true; return () => { current.current.mounted = false; }; }, []);
  const allowed = visible && parent.allowed && parent.check() && (isAllowed?.() ?? true);
  const value = useMemo<PrivateContentAccess>(() => ({ allowed, check: () => {
    const state = current.current;
    return state.mounted && state.visible && state.parent.check() && (state.isAllowed?.() ?? true);
  } }), [allowed]);
  return <PrivateContentContext.Provider value={value}><View style={{ flex: 1, display: allowed ? "flex" : "none" }} pointerEvents={allowed ? "auto" : "none"}
    accessibilityElementsHidden={!allowed} importantForAccessibility={allowed ? "auto" : "no-hide-descendants"} aria-hidden={!allowed}>{children}</View></PrivateContentContext.Provider>;
}
