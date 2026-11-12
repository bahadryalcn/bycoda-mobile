import { requireOptionalNativeModule } from "expo";

import type { LiveActivityProps } from "../model/snapshot";

const STALE_MS = 15 * 60_000;

/**
 * Starts, updates or ends the local session Live Activity. `null` ends it. Local only: there
 * is no push relay, so the activity goes "out of date" if the app is suspended for long.
 * Never throws (activities can be disabled by the user or unavailable on the device).
 */
export async function syncSessionActivity(props: LiveActivityProps | null): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  try {
    const { default: activity } = await import("../ui/SessionActivity");
    const instances = activity.getInstances();
    if (!props) {
      await Promise.all(instances.map((instance) => instance.end("immediate")));
      return;
    }
    const stale = new Date(Date.now() + STALE_MS);
    const [current, ...extra] = instances;
    await Promise.all(extra.map((instance) => instance.end("immediate")));
    if (current) await current.update(props, stale);
    else activity.start(props, props.url, stale);
  } catch {
    // Activities are optional; the widgets keep working.
  }
}
