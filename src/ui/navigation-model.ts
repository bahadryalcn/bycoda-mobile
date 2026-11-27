/**
 * Pure navigation rules shared by every route: the logical parent of a page, the tab a page belongs
 * under, and when an external entry (cold deep link, notification, quick action, share, restored
 * session) should get that parent beneath it. `navigation.ts` applies them through the router.
 */

/** Bottom tabs, by route name inside `app/(tabs)`. */
export type TabName = "index" | "chats" | "inbox" | "manage" | "settings";

export const TAB_HREF: Record<TabName, string> = {
  index: "/",
  chats: "/chats",
  inbox: "/inbox",
  manage: "/manage",
  settings: "/settings",
};

const TAB_NAMES = new Set<string>(Object.keys(TAB_HREF));

type HrefLike = string | { pathname?: string | null } | null | undefined;

/**
 * A route name (`session/[id]`), pathname (`/session/abc`) or href with a query, reduced to its
 * segments without the leading slash, query, hash or route groups.
 */
export function routeSegments(target: HrefLike): string[] {
  const raw = typeof target === "string" ? target : target?.pathname ?? "";
  const path = raw.split(/[?#]/, 1)[0] ?? "";
  return path.split("/").filter((segment) => segment && !/^\(.*\)$/.test(segment));
}

/** Where a page belongs: its parent href and the tab that parent lives under. `null` for tab roots. */
export function routeParent(target: HrefLike): { href: string; tab: TabName } | null {
  const [first = "", second] = routeSegments(target);
  if (!first || first === "index") return null;
  if (TAB_NAMES.has(first) && second === undefined) return null;
  switch (first) {
    case "session":
    case "session-reference":
    case "sessions":
      return { href: TAB_HREF.chats, tab: "chats" };
    case "inbox":
    case "approvals":
      return { href: TAB_HREF.inbox, tab: "inbox" };
    case "pull-requests":
      // The list is opened from Projects (or a project); a pull request belongs to the list.
      return second && second !== "index" ? { href: "/pull-requests", tab: "index" } : { href: TAB_HREF.index, tab: "index" };
    case "settings":
    case "account":
    case "account-notifications":
    case "licenses":
    case "legal":
    case "feedback":
    case "report":
      return { href: TAB_HREF.settings, tab: "settings" };
    case "manage":
    case "tools":
      return { href: TAB_HREF.manage, tab: "manage" };
    default:
      // Projects, computers, the assistant, the demo and developer pages belong to Home.
      return { href: TAB_HREF.index, tab: "index" };
  }
}

type RouteLike = { key: string; name: string; params?: object; state?: StateLike };
export type StateLike = { key?: string; index?: number; routes: readonly RouteLike[]; history?: readonly unknown[] } | undefined;

const TABS_ROUTE = "(tabs)";

/** The tab navigator's state is untouched: its first tab is focused and nothing else was visited. */
function isPristineTabs(tabs: StateLike): boolean {
  if (!tabs) return true;
  const focused = tabs.routes[tabs.index ?? 0];
  return (tabs.index ?? 0) === 0 && (!focused || focused.name === "index") && (tabs.history?.length ?? 1) <= 1;
}

/**
 * The app is at its launch position: only the tabs on the root stack, on Home. An external entry
 * opened from here has no previous screen of its own, so it gets its logical parent tab beneath it.
 * Any other position is history the user made, and Back must return there instead.
 */
export function isPristineRoot(root: StateLike): boolean {
  if (!root || root.routes.length !== 1) return false;
  const only = root.routes[0];
  return only?.name === TABS_ROUTE && isPristineTabs(only.state);
}

/**
 * For a cold deep link the router builds `[(tabs), page]` (the root `anchor`), with Home under the
 * page. Returns the tab to focus beneath it so Back lands on the page's parent, or null when the
 * state is something else, the tabs are not mounted yet, or Home already is the parent.
 */
export function coldEntryAlignment(root: StateLike): { tabsKey: string; tab: TabName; entryKey: string } | null {
  if (!root || root.routes.length !== 2) return null;
  const [tabs, entry] = root.routes;
  if (!tabs || !entry || tabs.name !== TABS_ROUTE || !tabs.state?.key || !isPristineTabs(tabs.state)) return null;
  const parent = routeParent(entry.name);
  if (!parent || parent.tab === "index") return null;
  return { tabsKey: tabs.state.key, tab: parent.tab, entryKey: entry.key };
}

/** The tab an external entry should place beneath itself, or null to navigate as is. */
export function externalEntryTab(root: StateLike, target: HrefLike): TabName | null {
  if (!isPristineRoot(root)) return null;
  const parent = routeParent(target);
  return parent && parent.tab !== "index" ? parent.tab : null;
}

/** A stable identity for an href, so a repeated tap on the same destination can be recognized. */
export function hrefKey(href: string | { pathname?: string | null; params?: object | null }): string {
  if (typeof href === "string") return href;
  const params = href.params ? Object.entries(href.params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)) : [];
  return `${href.pathname ?? ""}?${JSON.stringify(params)}`;
}

/**
 * Drops a second push of the same destination while the first is still settling (a double tap).
 * A different destination, or the same one after `sameMs`, passes.
 */
export function createPushGate({ sameMs = 700, now = () => Date.now() } = {}) {
  let last: { key: string; at: number } | null = null;
  return (key: string): boolean => {
    const at = now();
    if (last && last.key === key && at - last.at < sameMs) return false;
    last = { key, at };
    return true;
  };
}

/** A concrete path for a route name and its params: `session/[id]` + `{ id: "a" }` → `/session/a`. */
function concretePath(name: string, params: Record<string, unknown> = {}): string {
  const segments = routeSegments(name).flatMap((segment) => {
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(segment);
    if (catchAll) { const value = params[catchAll[1]!]; return Array.isArray(value) ? value.map(String) : [String(value ?? "")]; }
    const dynamic = /^\[(.+)\]$/.exec(segment);
    return [dynamic ? String(params[dynamic[1]!] ?? "") : segment];
  }).filter((segment) => segment && segment !== "index");
  return `/${segments.map((segment) => encodeURIComponent(decodeURIComponentSafe(segment))).join("/")}`;
}

function decodeURIComponentSafe(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** The path an href opens, without its query. */
export function hrefPath(href: string | { pathname?: string | null; params?: object | null }): string {
  if (typeof href === "string") return concretePath(href.split(/[?#]/, 1)[0] ?? "");
  return concretePath(href.pathname ?? "", (href.params ?? {}) as Record<string, unknown>);
}

/** The focused page's path in a navigation state, descending through nested navigators. */
export function focusedPath(root: StateLike): string | null {
  const names: string[] = [];
  let state = root;
  let params: Record<string, unknown> = {};
  while (state) {
    const route = state.routes[state.index ?? state.routes.length - 1];
    if (!route) break;
    names.push(route.name);
    params = { ...params, ...(route.params as Record<string, unknown> | undefined) };
    state = route.state;
  }
  return names.length ? concretePath(names.join("/"), params) : null;
}
