import type { WidgetSnapshot } from "../model/snapshot";

/** Web and unsupported platforms have no widgets. */
export async function publishWidgetSnapshot(
  _snapshot: WidgetSnapshot,
  _isCurrent: () => boolean = () => true,
): Promise<void> {}
