import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as QuickActions from "expo-quick-actions";
import { router, useRootNavigationState, type Href } from "expo-router";

import { useMachines } from "@/state/machines";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";

import { useAccountAccess } from "../../account/model/account-access";
import { useShareIntentReceiver } from "../../sharing/hooks/use-share-intent-receiver";

import {
  quickActionHref,
  quickActionItems,
  quickActionMachineId,
  recentQuickActionSessions,
  resolveQuickAction,
} from "../model/quick-actions";
import { useWidgetFeedStore } from "../model/widget-feed";
import { useWidgetPreferences } from "../model/widget-preferences";

let initialConsumed = false;

/**
 * Publishes launcher quick actions and routes taps. Actions that arrive before the router
 * is ready (cold start) are queued so they open on top of the initial route instead of
 * being lost or stacking over it.
 */
export function useQuickActions() {
  // Same app-lifecycle mount point: the system share sheet is another inbound entry point.
  useShareIntentReceiver();
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

  const machinesReady = useMachines(
    (state) => state.hydrated && !state.storageError && !state.connectionPending,
  );
  const securityStatus = useSecurity((state) => state.status);
  const appState = useSecurity((state) => state.appState);
  const accountStatus = useAccountAccess((state) => state.status);

  // A tap is routed once the router, the paired computers and app access are ready; a tap that
  // names a computer waits (still queued) through cold start and lock, and the access values
  // are listed so unlocking re-runs it. Switching computers never happens while locked.
  useEffect(() => {
    if (!routerReady || !queued.current) return;
    const href = queued.current;
    if (quickActionMachineId(href) && (!machinesReady || !isAppAccessAllowed())) return;
    queued.current = null;
    const machines = useMachines.getState();
    const outcome = resolveQuickAction(href, machines.machines, machines.activeId);
    if (outcome.kind === "unpaired") {
      showToast({
        tone: "warning",
        message: copy("Bu bilgisayar artık eşleştirilmemiş.", "This computer is no longer paired."),
      });
      return;
    }
    if (outcome.selectMachineId) {
      machines.selectMachine(outcome.selectMachineId);
      if (useMachines.getState().activeId !== outcome.selectMachineId) {
        showToast({
          tone: "warning",
          message: copy("Bilgisayar değiştirilemedi.", "Could not switch computers."),
        });
        return;
      }
    }
    router.push(href as Href);
    // `copy` only words the toasts; re-running on a language change would not re-route a consumed tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [routerReady, arrivals, machinesReady, securityStatus, appState, accountStatus]);

  const feed = useWidgetFeedStore((state) => state.feed);
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const itemsKey = JSON.stringify(
    quickActionItems(copy, recentQuickActionSessions(feed, showTitles, undefined, copy("Yeni oturum", "New session"))),
  );
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const icons: Record<string, string> = ios
      ? { "new-session": "symbol:square.and.pencil", sessions: "symbol:list.bullet" }
      : { "new-session": "shortcut_icon", sessions: "shortcut_icon" };
    const items = (JSON.parse(itemsKey) as ReturnType<typeof quickActionItems>).map((item) => ({
      ...item,
      // Recent sessions have no fixed id; fall back to a generic icon.
      icon: icons[item.id] ?? (ios ? "symbol:bubble.left" : "shortcut_icon"),
    }));
    void QuickActions.setItems(items).catch(() => undefined);
  }, [itemsKey]);
}
