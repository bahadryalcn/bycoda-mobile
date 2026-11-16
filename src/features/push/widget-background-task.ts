import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import { mergeWidgetUpdate, WIDGET_CACHE_KEY, type WidgetCache } from "../widgets/model/background-snapshot";
import { liveActivityProps } from "../widgets/model/snapshot";
import { withWidgetStorage, widgetWorkGeneration } from "../widgets/platform/widget-cache";
import { publishWidgetSnapshot } from "../widgets/platform/publish";
import { syncSessionActivity } from "../widgets/platform/live-activity";
import { decodeWidgetPreferences, WIDGET_PREFERENCES_KEY } from "../widgets/model/widget-preferences";
import { PUSH_PREFERENCES_KEY } from "./push-model";

const TASK = "bycoda-widget-push-v1";

/** Background notification envelopes differ between Android headless, iOS and foreground delivery. */
export function widgetTaskData(payload: Notifications.NotificationTaskPayload): unknown {
  if ("actionIdentifier" in payload) return payload.notification.request.content.data;
  if (typeof payload.data.dataString === "string") {
    try { return JSON.parse(payload.data.dataString); } catch { return null; }
  }
  return payload.data;
}

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
    await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(next));
    if (generation !== widgetWorkGeneration()) return false;
    await publishWidgetSnapshot(next.snapshot, () => generation === widgetWorkGeneration());
    if (generation !== widgetWorkGeneration()) return false;
    await syncSessionActivity(next.snapshot.stale ? null : liveActivityProps(next.snapshot), true);
    return true;
  });
}

/** Entry-level setup runs even when Expo starts JS without mounting React. */
async function registerWidgetBackgroundTask(): Promise<void> {
  if (process.env.EXPO_OS === "web" || !requireOptionalNativeModule("ExpoTaskManager")) return;
  const TaskManager = await import("expo-task-manager");
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data, error }) => {
    if (error || !data) return Notifications.BackgroundNotificationTaskResult.Failed;
    try {
      return await receiveWidgetPush(widgetTaskData(data))
        ? Notifications.BackgroundNotificationTaskResult.NewData : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch { return Notifications.BackgroundNotificationTaskResult.Failed; }
  });
  await Notifications.registerTaskAsync(TASK);
}

export const widgetTaskRegistration = registerWidgetBackgroundTask().catch(() => {
  // Missing native task support requires an app rebuild; foreground publication remains available.
});
