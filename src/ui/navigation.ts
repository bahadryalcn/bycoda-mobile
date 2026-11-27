import { useEffect, useRef } from "react";
import { router, useNavigationContainerRef, useRootNavigationState, type Href } from "expo-router";
import {
  TAB_HREF,
  coldEntryAlignment,
  createPushGate,
  externalEntryTab,
  focusedPath,
  hrefKey,
  hrefPath,
  routeParent,
  type StateLike,
} from "./navigation-model";

/**
 * The one way a page leaves to a named destination: return to it if it is already in the stack
 * (popping what is above), otherwise put it in place of the current page. Unlike `router.replace`,
 * this never adds a second copy of Home or a list that is already beneath.
 */
export function leaveTo(href: Href) {
  router.dismissTo(href);
}

/**
 * Back for in-page buttons (Go back, Close, Done after a delete): the previous screen when there is
 * one, otherwise the page's logical parent (`fallback`, or the parent of `from`), never nothing.
 */
export function goBack(fallback?: Href, from?: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  leaveTo(fallback ?? (routeParent(from)?.href as Href | undefined) ?? (TAB_HREF.index as Href));
}

/** Reads the live root state; installed by `NavigationAnchor` once the container exists. */
let readRoot: () => StateLike = () => undefined;

const pushGate = createPushGate();

/**
 * `router.push` for taps: a double tap opens the destination once. A push of the page that is
 * already in front, or a repeat of the same push while it is still settling, is dropped.
 */
export function pushOnce(href: Href) {
  const target = href as Parameters<typeof hrefKey>[0];
  let root: StateLike;
  try {
    root = readRoot();
  } catch {
    root = undefined;
  }
  // Without a live navigator there is nothing to compare against; the push is passed through.
  if (root) {
    if (focusedPath(root) === hrefPath(target)) return;
    if (!pushGate(hrefKey(target))) return;
  }
  router.push(href);
}

/**
 * Opens a destination that came from outside the current screen (notification, quick action,
 * share, restored session). From the launch position (Home, nothing pushed) the page's parent tab
 * is focused first, so Back lands on Sessions, Inbox, Settings or Tools instead of Home.
 * Navigate (not push) by default: a repeated entry returns to the open screen instead of a copy.
 */
export function openExternalEntry(href: Href, options?: { push?: boolean }) {
  let root: StateLike;
  try {
    root = readRoot();
  } catch {
    root = undefined;
  }
  const tab = externalEntryTab(root, href as Parameters<typeof externalEntryTab>[1]);
  // The router queues actions in order: the tab switch completes before the page opens over it.
  if (tab) router.navigate(TAB_HREF[tab] as Href);
  if (options?.push) router.push(href);
  else router.navigate(href);
}

/**
 * Mounted once under the root stack. A cold deep link opens its page over Home (the root `anchor`);
 * once the tabs beneath have mounted, this focuses the page's parent tab there, so header Back, the
 * iOS swipe and Android Back all land on Sessions, Inbox, Settings or Tools. It acts only while the
 * page the app launched into is the one in front, over the tabs it launched with. It also lets `openExternalEntry` read the live state.
 * A separate component, so following navigation state never re-renders the root navigator.
 */
export function NavigationAnchor(): null {
  const ref = useNavigationContainerRef();
  const root = useRootNavigationState() as StateLike & { key?: string };
  const launch = useRef<{ entryKey: string | null; done: boolean; aligned: string[] } | null>(null);
  useEffect(() => {
    readRoot = () => (ref.isReady() ? (ref.getRootState() as StateLike) : undefined);
    return () => { readRoot = () => undefined; };
  }, [ref]);
  useEffect(() => {
    if (!root?.key) return;
    if (!launch.current) {
      // The first ready state is the launch: a second route there came from the initial URL.
      launch.current = { entryKey: root.routes.length === 2 ? root.routes[1]?.key ?? null : null, done: false, aligned: [] };
    }
    const state = launch.current;
    if (state.done || !state.entryKey) return;
    if (root.routes.length !== 2 || root.routes[1]?.key !== state.entryKey) {
      state.done = true;
      return;
    }
    const alignment = coldEntryAlignment(root);
    // The tabs remount once when the saved computers hydrate (`key={machineId}`); a fresh tab
    // navigator starts on Home again, so it is aligned too. Each navigator instance only once.
    if (!alignment || state.aligned.includes(alignment.tabsKey)) return;
    state.aligned.push(alignment.tabsKey);
    if (state.aligned.length >= 3) state.done = true;
    try {
      ref.dispatch({ type: "NAVIGATE", payload: { name: alignment.tab }, target: alignment.tabsKey });
    } catch {
      // A navigator that is not mounted yet keeps Home beneath; Back still stays in the app.
    }
  }, [root, ref]);
  return null;
}
