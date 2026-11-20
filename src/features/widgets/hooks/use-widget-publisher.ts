import { useLocale } from "@/i18n";
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
import { publishAndCacheWidget, invalidateWidgetWork } from "../platform/widget-cache";
import { useAccountAccess } from "../../account/model/account-access";
import { widgetLabels } from "../model/widget-labels";
import { nextPublishStep } from "../model/publish-gate";

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
  const locale = useLocale();
  const machine = useActiveMachine();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const lockEnabled = useSecurity((state) => state.enabled);
  const signedIn = useAccountAccess((state) => state.status === "signedIn");
  const showQuestionText = useWidgetPreferences((state) => state.showQuestionText);
  const feed = useWidgetFeedStore((state) => state.feed);
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const [appState, setAppState] = useState<AppStateStatus>(
    () => (AppState.currentState ?? "active") as AppStateStatus,
  );
  const [beat, setBeat] = useState(0);
  const [activity, setActivity] = useState<LiveActivityProps | null>(null);
  const published = useRef({ identity: "", at: 0 });
  const labels = widgetLabels(copy);
  const labelsKey = JSON.stringify(labels);
  const machineId = machine?.id ?? null;
  const machineName = machine?.name ?? "";
  const environmentId = machine?.environmentId ?? "";

  // Keep foreground publication and the stale deadline in step with app lifecycle.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    const timer = setInterval(() => setBeat((value) => value + 1), HEARTBEAT_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  // Publish only privacy-settled state; every changed authority retires queued writes.
  useEffect(() => {
    const now = Date.now();
    const input = {
      machine: machineId ? { id: machineId, name: machineName } : null,
      unlocked: unlocked && signedIn,
      // A feed from another computer, or one the tabs screen cleared, is not trustworthy.
      ready: feed.ready && feed.machineId === machineId,
      sessions: feed.sessions,
      projects: feed.projects,
      locale,
      showTitles,
      showQuestionText,
      now,
      labels: JSON.parse(labelsKey) as WidgetLabels,
      palette: widgetPalette,
    };
    const snapshot = buildWidgetSnapshot(input);
    const identity = snapshot
      ? `${snapshotIdentity(snapshot)}:${JSON.stringify(feed.projects)}`
      : null;
    const step = nextPublishStep(published.current, identity, now, HEARTBEAT_MS);
    if (step === "skip") return;
    if (step === "retire") {
      // Only a visible change retires in-flight writes; the claim goes with them.
      invalidateWidgetWork();
      published.current = { identity: "", at: 0 };
    }
    if (!snapshot) return;
    const timer = setTimeout(
      () => {
        published.current = { identity: identity ?? "", at: Date.now() };
        void publishAndCacheWidget(input, snapshot, environmentId, !lockEnabled && signedIn).catch(
          () => {
            // A failed write is retried by the next change or heartbeat.
            published.current = { identity: "", at: 0 };
          },
        );
        const next = liveActivityProps(snapshot);
        setActivity((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      },
      snapshot.state === "ready" ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [
    machineId,
    machineName,
    environmentId,
    unlocked,
    lockEnabled,
    signedIn,
    feed,
    showTitles,
    showQuestionText,
    locale,
    labelsKey,
    beat,
  ]);

  // Unmount retires writes still queued for the old screen; cleanup must not run on dep changes.
  useEffect(() => () => invalidateWidgetWork(), []);

  // The activity exists only while the app is not in the foreground; returning ends it.
  useEffect(() => {
    void syncSessionActivity(appState === "active" ? null : activity).catch(() => undefined);
  }, [appState, activity]);
}
