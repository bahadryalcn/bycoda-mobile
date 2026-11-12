import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useActiveMachine } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useCopy } from "@/ui/copy";

import { widgetPalette } from "../model/palette";
import {
  buildWidgetSnapshot,
  liveActivityProps,
  snapshotIdentity,
  type LiveActivityProps,
  type WidgetLabels,
} from "../model/snapshot";
import { useWidgetPreferences } from "../model/widget-preferences";
import { useWidgetFeedStore } from "../model/widget-feed";
import { syncSessionActivity } from "../platform/live-activity";
import { publishWidgetSnapshot } from "../platform/publish";

const DEBOUNCE_MS = 1_000;
/** Republish unchanged data before the 10 minute snapshot TTL marks it stale. */
const HEARTBEAT_MS = 4 * 60_000;

/**
 * Builds widget snapshots from existing app state and publishes them, debounced and only
 * when something visible changed. A locked or computer-less app publishes immediately so
 * widgets never keep showing sessions after the app locks.
 */
export function useWidgetPublisher() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const feed = useWidgetFeedStore((state) => state.feed);
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const [appState, setAppState] = useState<AppStateStatus>(() => (AppState.currentState ?? "active") as AppStateStatus);
  const [beat, setBeat] = useState(0);
  const [activity, setActivity] = useState<LiveActivityProps | null>(null);
  const published = useRef({ identity: "", at: 0 });
  const labels: WidgetLabels = {
    title: copy("Oturumlar", "Sessions"),
    running: copy("Çalışıyor", "Running"),
    needsInput: copy("Yanıt bekliyor", "Needs input"),
    failed: copy("Başarısız", "Failed"),
    empty: copy("Aktif oturum yok", "No active sessions"),
    locked: copy("Devam etmek için bycoda'yı aç", "Open bycoda to continue"),
    setup: copy("Bağlanmak için bycoda'yı aç", "Open bycoda to connect"),
    stale: copy("Yenilemek için bycoda'yı aç", "Open bycoda to refresh"),
  };
  const labelsKey = JSON.stringify(labels);
  const machineId = machine?.id ?? null;
  const machineName = machine?.name ?? "";

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    const timer = setInterval(() => setBeat((value) => value + 1), HEARTBEAT_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const snapshot = buildWidgetSnapshot({
      machine: machineId ? { id: machineId, name: machineName } : null,
      unlocked,
      // A feed from another computer, or one the tabs screen cleared, is not trustworthy.
      ready: feed.ready && feed.machineId === machineId,
      sessions: feed.sessions,
      showTitles,
      now,
      labels: JSON.parse(labelsKey) as WidgetLabels,
      palette: widgetPalette,
    });
    if (!snapshot) return;
    const identity = snapshotIdentity(snapshot);
    const last = published.current;
    if (identity === last.identity && now - last.at < HEARTBEAT_MS) return;
    const timer = setTimeout(
      () => {
        published.current = { identity, at: Date.now() };
        void publishWidgetSnapshot(snapshot).catch(() => {
          // A failed write is retried by the next change or heartbeat.
          published.current = { identity: "", at: 0 };
        });
        const next = liveActivityProps(snapshot);
        setActivity((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      },
      snapshot.state === "ready" ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [machineId, machineName, unlocked, feed, showTitles, labelsKey, beat]);

  // The activity exists only while the app is not in the foreground; returning ends it.
  useEffect(() => {
    void syncSessionActivity(appState === "active" ? null : activity).catch(() => undefined);
  }, [appState, activity]);
}
