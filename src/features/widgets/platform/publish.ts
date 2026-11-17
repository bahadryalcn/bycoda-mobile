import type { WidgetSnapshot } from "../model/snapshot";
import type { UsageWidgetSnapshot } from "../model/usage-widget";

/** Web and unsupported platforms have no widgets. */
export async function publishWidgetSnapshot(
  _snapshot: WidgetSnapshot,
  _isCurrent: () => boolean = () => true,
): Promise<void> {}

/** Web and unsupported platforms have no widgets. */
export async function publishUsageSnapshot(_snapshot: UsageWidgetSnapshot): Promise<void> {}
