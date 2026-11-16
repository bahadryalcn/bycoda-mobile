import { useEffect } from "react";

import { useQuickActions } from "./hooks/use-quick-actions";
import { useWidgetPublisher } from "./hooks/use-widget-publisher";
import { useWidgetPreferences } from "./model/widget-preferences";
import { useWidgetFeedStore } from "./model/widget-feed";
import { useAccountAccess } from "../account/model/account-access";
import { useSecurity } from "@/state/security";
import { useMachines } from "@/state/machines";
import { revokeWidgetCache } from "./platform/widget-cache";
import { syncSessionActivity } from "./platform/live-activity";

function ActiveWidgetCoordinator() {
  // Retire pending background work synchronously when any authority/privacy choice changes.
  useEffect(() => {
    const revoke = () => {
      void revokeWidgetCache().catch(() => undefined);
      void syncSessionActivity(null).catch(() => undefined);
    };
    const removers = [
      useSecurity.subscribe((state, previous) => {
        if (state.status !== previous.status && state.status !== "unlocked") revoke();
      }),
      useAccountAccess.subscribe((state, previous) => {
        if (state.status !== previous.status) revoke();
      }),
      useMachines.subscribe((state, previous) => {
        const current = state.machines.find((machine) => machine.id === state.activeId);
        const before = previous.machines.find((machine) => machine.id === previous.activeId);
        if (
          state.activeId !== previous.activeId ||
          current?.environmentId !== before?.environmentId ||
          current?.endpoint !== before?.endpoint ||
          state.storageError !== previous.storageError
        )
          revoke();
      }),
      useWidgetPreferences.subscribe((state, previous) => {
        if (
          state.showTitles !== previous.showTitles ||
          state.showQuestionText !== previous.showQuestionText
        )
          revoke();
      }),
      useWidgetFeedStore.subscribe((state, previous) => {
        if (previous.feed.ready && !state.feed.ready) revoke();
      }),
    ];
    return () => removers.forEach((remove) => remove());
  }, []);
  const hydrate = useWidgetPreferences((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useWidgetPublisher();
  useQuickActions();
  return null;
}

/**
 * Mounted once in the app lifecycle. Widgets, Live Activities and quick actions are native
 * only: on web every part is skipped, and without the native modules (Expo Go) each
 * platform file degrades to a no-op.
 */
export function WidgetCoordinator() {
  if (process.env.EXPO_OS === "web") return null;
  return <ActiveWidgetCoordinator />;
}
