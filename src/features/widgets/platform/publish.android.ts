import { requireOptionalNativeModule } from "expo";
import type { WidgetSnapshot } from "../model/snapshot";

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
