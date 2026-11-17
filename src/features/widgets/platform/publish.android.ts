import { requireOptionalNativeModule } from "expo";
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
  attention.default.updateSnapshot(snapshot);
}

/** Usage widget: Android renders the reading directly, with no timeline. */
export async function publishUsageSnapshot(snapshot: UsageWidgetSnapshot): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const usage = await import("../ui/UsageLimits.android");
  usage.default.updateSnapshot(snapshot);
}
