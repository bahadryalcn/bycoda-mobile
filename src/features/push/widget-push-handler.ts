import AsyncStorage from "@react-native-async-storage/async-storage";
import { mergeWidgetUpdate, WIDGET_CACHE_KEY, type WidgetCache } from "../widgets/model/background-snapshot";
import {
  liveActivityProps,
  snapshotIdentity,
  SNAPSHOT_TTL_MS,
  type WidgetSnapshot,
} from "../widgets/model/snapshot";
import { withWidgetStorage, widgetWorkGeneration } from "../widgets/platform/widget-cache";
import { publishWidgetSnapshot } from "../widgets/platform/publish";
import { syncSessionActivity } from "../widgets/platform/live-activity";
import { decodeWidgetPreferences, WIDGET_PREFERENCES_KEY } from "../widgets/model/widget-preferences";
import { PUSH_PREFERENCES_KEY } from "./push-model";

/**
 * Background widget push handler. Loaded only when a push arrives (see widget-background-task.ts),
 * so cold starts do not evaluate the widget cache, publisher or Live Activity graph.
 */
export async function receiveWidgetPush(data: unknown): Promise<boolean> {
  return withWidgetStorage(async () => {
    const generation = widgetWorkGeneration();
    const [raw, preferences, machines, widgetPreferences] = await Promise.all([
      AsyncStorage.getItem(WIDGET_CACHE_KEY), AsyncStorage.getItem(PUSH_PREFERENCES_KEY),
      AsyncStorage.getItem("bycoda.mobile.remote-machines.v1"), AsyncStorage.getItem(WIDGET_PREFERENCES_KEY),
    ]);
    if (!raw || !machines || generation !== widgetWorkGeneration()) return false;
    const cache = JSON.parse(raw) as WidgetCache;
    const saved = JSON.parse(machines) as { activeId?: string; machines?: { id: string; environmentId: string }[] };
    // Removal, route/computer switch and disabled pushes retire the persisted authority too.
    if (saved.activeId !== cache.machineId || !saved.machines?.some(m => m.id === cache.machineId && m.environmentId === cache.environmentId) ||
      (preferences && JSON.parse(preferences).enabled === false)) return false;
    const choices = decodeWidgetPreferences(widgetPreferences);
    const next = mergeWidgetUpdate({ ...cache, showTitles: cache.showTitles && choices.showTitles,
      showQuestionText: cache.showQuestionText && choices.showQuestionText }, data, Date.now());
    if (!next) return false;
    const now = Date.now();
    // A heartbeat that changes nothing visible keeps the published timeline while it still has
    // more than half its time left; the widget and Live Activity would render the same thing.
    // "No data" also tells iOS the wake was not needed.
    if (unchangedAndFresh(cache.snapshot, next.snapshot, now)) {
      await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify({ ...next, snapshot: cache.snapshot }));
      return false;
    }
    await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(next));
    if (generation !== widgetWorkGeneration()) return false;
    await publishWidgetSnapshot(next.snapshot, () => generation === widgetWorkGeneration());
    if (generation !== widgetWorkGeneration()) return false;
    await syncSessionActivity(next.snapshot.stale ? null : liveActivityProps(next.snapshot), true);
    return true;
  });
}

/** True when `next` would show exactly what the published `current` timeline already shows. */
export function unchangedAndFresh(current: WidgetSnapshot, next: WidgetSnapshot, now: number): boolean {
  return (
    current.expiresAt - now > SNAPSHOT_TTL_MS / 2 &&
    snapshotIdentity(current) === snapshotIdentity(next)
  );
}
