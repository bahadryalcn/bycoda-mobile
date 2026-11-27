import { requireOptionalNativeModule } from "expo";
import { attentionPublishDue, markAttentionPublished } from "../model/publish-gate";
import type { WidgetSnapshot } from "../model/snapshot";
import type { UsageWidgetSnapshot } from "../model/usage-widget";

/** Taps are handled by generated native providers, including with no JS runtime. */
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
  active.default.updateSnapshot(snapshot);
  // NeedsAttention reloads only when its own slice changed or its expiry is near.
  if (attentionPublishDue(snapshot)) {
    attention.default.updateSnapshot(snapshot);
    markAttentionPublished(snapshot);
  }
}

/** Usage widget: Android renders the reading directly, with no timeline. */
export async function publishUsageSnapshot(snapshot: UsageWidgetSnapshot): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const usage = await import("../ui/UsageLimits.android");
  usage.default.updateSnapshot(snapshot);
}
