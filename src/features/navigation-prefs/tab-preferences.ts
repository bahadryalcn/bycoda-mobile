/**
 * Dock tabs the owner may hide, in their fixed dock order. Settings is always shown, last, and not
 * listed here. Tabs are not reorderable (owner decision: no drag-and-drop reordering).
 */
export const DOCK_TAB_IDS = ["index", "chats", "inbox", "manage"] as const;
export type DockTabId = (typeof DOCK_TAB_IDS)[number];
export const SETTINGS_TAB = "settings";

export type TabPreferences = { hidden: DockTabId[] };
export const defaultTabPreferences: TabPreferences = { hidden: [] };

export function hasCustomTabLayout(tabs: TabPreferences): boolean {
  return tabs.hidden.length > 0;
}

/** The visible dock tabs (Settings excluded), in the fixed order. */
export function visibleDockTabs(tabs: TabPreferences): DockTabId[] {
  return DOCK_TAB_IDS.filter((id) => !tabs.hidden.includes(id));
}

const isTabId = (value: unknown): value is DockTabId => DOCK_TAB_IDS.includes(value as DockTabId);

/**
 * Unknown or duplicate ids are dropped. A stored `order` from the retired reordering is ignored and
 * not written back; a stored state that hides every tab keeps the first one visible.
 */
export function normalizeTabPreferences(value: unknown): TabPreferences {
  const data = value && typeof value === "object" ? (value as { hidden?: unknown }) : {};
  const hidden = [...new Set(Array.isArray(data.hidden) ? data.hidden.filter(isTabId) : [])];
  return { hidden: hidden.length >= DOCK_TAB_IDS.length ? hidden.filter((id) => id !== DOCK_TAB_IDS[0]) : hidden };
}

/** The dock always keeps one tab besides Settings; the last visible one cannot be hidden. */
export function isLastVisibleTab(preferences: TabPreferences, id: DockTabId): boolean {
  return !preferences.hidden.includes(id) && visibleDockTabs(preferences).length <= 1;
}

export function setTabHidden(preferences: TabPreferences, id: DockTabId, hidden: boolean): TabPreferences {
  if (hidden && isLastVisibleTab(preferences, id)) return preferences;
  const rest = preferences.hidden.filter((item) => item !== id);
  return { ...preferences, hidden: hidden ? [...rest, id] : rest };
}

type Route = { key: string; name: string };

/**
 * The dock's routes: visible tabs in the fixed order, then Settings. Hidden tabs stay routable
 * (deep links) but have no dock button; the focused index follows the route, or is -1 when hidden.
 */
export function dockTabState<S extends { index: number; routes: readonly Route[] }>(
  state: S,
  preferences: TabPreferences,
): Omit<S, "routes" | "index"> & { index: number; routes: S["routes"][number][] } {
  const byName = new Map(state.routes.map((route) => [route.name, route]));
  const routes: S["routes"][number][] = [];
  for (const id of visibleDockTabs(preferences)) {
    const route = byName.get(id);
    if (route) routes.push(route);
  }
  const settings = byName.get(SETTINGS_TAB);
  if (settings) routes.push(settings);
  const focused = state.routes[state.index]?.key;
  return { ...state, routes, index: routes.findIndex((route) => route.key === focused) };
}
