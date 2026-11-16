import { requireOptionalNativeModule } from "expo";

import { widgetTimeline, type WidgetSnapshot } from "../model/snapshot";

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
  attention.default.updateTimeline(timeline);
}
