import { useEffect } from "react";

import { useQuickActions } from "./hooks/use-quick-actions";
import { useWidgetPublisher } from "./hooks/use-widget-publisher";
import { useWidgetPreferences } from "./model/widget-preferences";

function ActiveWidgetCoordinator() {
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
