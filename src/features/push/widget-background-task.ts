import { requireOptionalNativeModule } from "expo";
import * as TaskManager from "expo-task-manager";
import type * as Notifications from "expo-notifications";

const TASK = "bycoda-widget-push-v1";

/** Background notification envelopes differ between Android headless, iOS and foreground delivery. */
export function widgetTaskData(payload: Notifications.NotificationTaskPayload): unknown {
  if ("actionIdentifier" in payload) return payload.notification.request.content.data;
  if (typeof payload.data.dataString === "string") {
    try { return JSON.parse(payload.data.dataString); } catch { return null; }
  }
  return payload.data;
}

/**
 * Entry-level shell: index.ts evaluates this before expo-router/entry, so it must define and register
 * the headless task without pulling in the widget cache, publisher or Live Activity graph. Those load
 * lazily inside the task body, only when a widget push actually arrives.
 */
function defineWidgetTask(): boolean {
  if (process.env.EXPO_OS === "web" || !requireOptionalNativeModule("ExpoTaskManager")) return false;
  // A headless launch looks the task up as soon as the bundle has evaluated, so it is defined
  // synchronously here; an awaited import would define it too late ("defined after the JavaScript
  // bundle finished loading") and the widget push would be dropped.
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data, error }) => {
    const Notifications = await import("expo-notifications");
    if (error || !data) return Notifications.BackgroundNotificationTaskResult.Failed;
    try {
      const { receiveWidgetPush } = await import("./widget-push-handler");
      return await receiveWidgetPush(widgetTaskData(data))
        ? Notifications.BackgroundNotificationTaskResult.NewData : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch { return Notifications.BackgroundNotificationTaskResult.Failed; }
  });
  return true;
}

async function registerWidgetBackgroundTask(): Promise<void> {
  if (!defineWidgetTask()) return;
  const Notifications = await import("expo-notifications");
  await Notifications.registerTaskAsync(TASK);
}

export const widgetTaskRegistration = registerWidgetBackgroundTask().catch(() => {
  // Missing native task support requires an app rebuild; foreground publication remains available.
});
