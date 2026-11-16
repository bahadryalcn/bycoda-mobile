import { requireOptionalNativeModule } from "expo";

import type { LiveActivityProps } from "../model/snapshot";

const STALE_MS = 15 * 60_000;

/**
 * Starts, updates or ends the local session Live Activity. `null` ends it. The
 * background notification task updates existing instances when iOS grants execution.
 * OS-delayed delivery still marks the activity out of date at its deadline.
 * Never throws (activities can be disabled by the user or unavailable on the device).
 */
export async function syncSessionActivity(
  props: LiveActivityProps | null,
  existingOnly = false,
): Promise<void> {
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
    else if (!existingOnly) activity.start(props, props.url, stale);
  } catch {
    // Activities are optional; the widgets keep working.
  }
}
