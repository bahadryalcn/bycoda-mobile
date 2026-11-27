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
  nextLiveActivity,
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
/** How often the publisher re-checks unchanged data. */
const HEARTBEAT_MS = 4 * 60_000;
/**
 * Unchanged data is republished only once this old. With 4 minute checks, a republish still
 * lands at most 9 minutes after the last one, before the 10 minute snapshot TTL marks it stale.
 */
const REPUBLISH_AFTER_MS = 5 * 60_000;

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
  /** Session activity times last written to the background cache. */
  const cachedTimes = useRef("");
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
    // Activity times are not visible, so they never trigger a widget reload in the foreground.
    // The background push merge compares them, so the cache is refreshed once the app leaves.
    const times = JSON.stringify(feed.sessions.map((session) => session.updatedAt));
    let step = nextPublishStep(published.current, identity, now, REPUBLISH_AFTER_MS);
    const flushTimes =
      step === "skip" && identity !== null && appState !== "active" && times !== cachedTimes.current;
    if (flushTimes) step = "publish";
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
        cachedTimes.current = times;
        void publishAndCacheWidget(input, snapshot, environmentId, !lockEnabled && signedIn).catch(
          () => {
            // A failed write is retried by the next change or heartbeat.
            published.current = { identity: "", at: 0 };
            cachedTimes.current = "";
          },
        );
        const next = liveActivityProps(snapshot);
        // Publish time alone does not re-render the Live Activity on every publish.
        setActivity((previous) => nextLiveActivity(previous, next));
      },
      snapshot.state === "ready" && !flushTimes ? DEBOUNCE_MS : 0,
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
    appState,
  ]);

  // Unmount retires writes still queued for the old screen; cleanup must not run on dep changes.
  useEffect(() => () => invalidateWidgetWork(), []);

  // The activity exists only while the app is not in the foreground; returning ends it.
  useEffect(() => {
    void syncSessionActivity(appState === "active" ? null : activity).catch(() => undefined);
  }, [appState, activity]);
}
