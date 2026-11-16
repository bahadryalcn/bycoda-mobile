import type { LiveActivityProps } from "../model/snapshot";

/** Live Activities are iOS only. */
export async function syncSessionActivity(
  _props: LiveActivityProps | null,
  _existingOnly = false,
): Promise<void> {}
