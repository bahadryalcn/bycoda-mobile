import { requireOptionalNativeModule } from "expo";
import { attentionPublishDue, markAttentionPublished } from "../model/publish-gate";

import { widgetTimeline, type WidgetSnapshot } from "../model/snapshot";
import { usageWidgetTimeline, type UsageWidgetSnapshot } from "../model/usage-widget";

/** No-op in Expo Go and any build without the ExpoWidgets native module. */
export async function publishWidgetSnapshot(
  snapshot: WidgetSnapshot,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const [active, attention] = await Promise.all([
    import("../ui/ActiveSessions"),
    import("../ui/NeedsAttention"),
  ]);
  if (!isCurrent()) return;
  const timeline = widgetTimeline(snapshot);
  active.default.updateTimeline(timeline);
  // NeedsAttention reloads only when its own slice changed or its expiry is near.
  if (attentionPublishDue(snapshot)) {
    attention.default.updateTimeline(timeline);
    markAttentionPublished(snapshot);
  }
}

/** Usage widget: the reading now, and the same reading marked stale when it expires. */
export async function publishUsageSnapshot(snapshot: UsageWidgetSnapshot): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const usage = await import("../ui/UsageLimits");
  usage.default.updateTimeline(usageWidgetTimeline(snapshot));
}
