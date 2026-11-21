/** Dock tabs the owner may reorder or hide. Settings is always shown, last, and not listed here. */
export const DOCK_TAB_IDS = ["index", "chats", "inbox", "manage"] as const;
export type DockTabId = (typeof DOCK_TAB_IDS)[number];
export const SETTINGS_TAB = "settings";

export type TabPreferences = { order: DockTabId[]; hidden: DockTabId[] };
export const defaultTabPreferences: TabPreferences = { order: [...DOCK_TAB_IDS], hidden: [] };

export function hasCustomTabLayout(tabs: TabPreferences): boolean {
  return tabs.hidden.length > 0 || tabs.order.some((id, position) => id !== DOCK_TAB_IDS[position]);
}

const isTabId = (value: unknown): value is DockTabId => DOCK_TAB_IDS.includes(value as DockTabId);

/** Unknown or duplicate ids are dropped; tabs missing from a stored order keep their default place at the end. */
export function normalizeTabPreferences(value: unknown): TabPreferences {
  const data = value && typeof value === "object" ? (value as { order?: unknown; hidden?: unknown }) : {};
  const order = [...new Set(Array.isArray(data.order) ? data.order.filter(isTabId) : [])];
  for (const id of DOCK_TAB_IDS) if (!order.includes(id)) order.push(id);
  const hidden = [...new Set(Array.isArray(data.hidden) ? data.hidden.filter(isTabId) : [])];
  return { order, hidden };
}

export function moveTab(preferences: TabPreferences, from: number, to: number): TabPreferences {
  if (from === to || from < 0 || to < 0 || from >= preferences.order.length || to >= preferences.order.length) return preferences;
  const order = [...preferences.order];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  return { ...preferences, order };
}

export function setTabHidden(preferences: TabPreferences, id: DockTabId, hidden: boolean): TabPreferences {
  const rest = preferences.hidden.filter((item) => item !== id);
  return { ...preferences, hidden: hidden ? [...rest, id] : rest };
}

type Route = { key: string; name: string };

/**
 * The dock's routes: visible tabs in the owner's order, then Settings. Hidden tabs stay routable
 * (deep links) but have no dock button; the focused index follows the route, or is -1 when hidden.
 */
export function dockTabState<S extends { index: number; routes: readonly Route[] }>(
  state: S,
  preferences: TabPreferences,
): Omit<S, "routes" | "index"> & { index: number; routes: S["routes"][number][] } {
  const byName = new Map(state.routes.map((route) => [route.name, route]));
  const routes: S["routes"][number][] = [];
  for (const id of preferences.order) {
    const route = byName.get(id);
    if (route && !preferences.hidden.includes(id)) routes.push(route);
  }
  const settings = byName.get(SETTINGS_TAB);
  if (settings) routes.push(settings);
  const focused = state.routes[state.index]?.key;
  return { ...state, routes, index: routes.findIndex((route) => route.key === focused) };
}
