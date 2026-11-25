import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PrivateContentAccess } from "./private-access";

type MenuChoice = { key: string; disabled?: boolean; onPress(): void };

/**
 * The one action a menu would hold, when it can run without the menu step; otherwise null.
 * A lone destructive action keeps the menu unless it opens its own review (`reviewed`).
 */
export function singleMenuAction<T extends { key: string; destructive?: boolean; reviewed?: boolean }>(items: readonly T[]): T | null {
  return items.length === 1 && (!items[0].destructive || !!items[0].reviewed) ? items[0] : null;
}

/** Shared across platforms; the menu's presentation never owns command authority. */
export function useMenuLifecycle<T extends MenuChoice>(items: readonly T[], access: PrivateContentAccess) {
  const [open, setOpen] = useState(false);
  const available = items.length > 0 && access.allowed;
  // An empty/hidden presentation retires its trigger and every retained choice.
  const token = useMemo(() => ({}), [available]);
  const current = useRef({ mounted: false, open, items, access, token });
  useLayoutEffect(() => {
    current.current = { mounted: true, open: open && available, items, access, token };
    if (!available && open) setOpen(false);
  });
  useLayoutEffect(() => () => {
    current.current.mounted = false;
    current.current.open = false;
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    const state = current.current;
    if (!state.mounted || state.token !== token) return;
    const allowed = next && state.items.length > 0 && state.access.allowed && state.access.check();
    state.open = allowed;
    setOpen(allowed);
  }, [token]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const select = useCallback((item: T) => {
    const state = current.current;
    if (!state.mounted || state.token !== token || !state.open) return;
    if (!state.access.allowed || !state.access.check()) { close(); return; }
    // A key may now refer to a different project/resource. Do not replay an old
    // row or silently substitute the current callback under that key.
    if (item.disabled || state.items.find(candidate => candidate.key === item.key) !== item) return;
    // Retire synchronously, before the callback can open a Sheet or start work.
    close();
    item.onPress();
  }, [close, token]);
  return { open: open && available, available, onOpenChange, close, select };
}
