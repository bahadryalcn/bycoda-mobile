import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as QuickActions from "expo-quick-actions";
import { router, useRootNavigationState, type Href } from "expo-router";

import { useCopy } from "@/ui/copy";

import { quickActionHref, quickActionItems } from "../model/quick-actions";

let initialConsumed = false;

/**
 * Publishes launcher quick actions and routes taps. Actions that arrive before the router
 * is ready (cold start) are queued so they open on top of the initial route instead of
 * being lost or stacking over it.
 */
export function useQuickActions() {
  const copy = useCopy();
  const routerReady = !!useRootNavigationState()?.key;
  const queued = useRef<string | null>(null);
  const [arrivals, setArrivals] = useState(0);

  useEffect(() => {
    if (!initialConsumed) {
      initialConsumed = true;
      queued.current = quickActionHref(QuickActions.initial);
      if (queued.current) setArrivals((value) => value + 1);
    }
    const subscription = QuickActions.addListener((action) => {
      const href = quickActionHref(action);
      if (!href) return;
      queued.current = href;
      setArrivals((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!routerReady || !queued.current) return;
    const href = queued.current;
    queued.current = null;
    router.push(href as Href);
  }, [routerReady, arrivals]);

  const itemsKey = JSON.stringify(quickActionItems(copy));
  useEffect(() => {
    const icons: Record<string, string> =
      Platform.OS === "ios"
        ? { "new-session": "symbol:square.and.pencil", sessions: "symbol:list.bullet" }
        : { "new-session": "shortcut_icon", sessions: "shortcut_icon" };
    const items = (JSON.parse(itemsKey) as ReturnType<typeof quickActionItems>).map((item) => ({
      ...item,
      icon: icons[item.id],
    }));
    void QuickActions.setItems(items).catch(() => undefined);
  }, [itemsKey]);
}
