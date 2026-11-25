import type { ReactElement } from "react";

/**
 * A native stack back item without the iOS 26+ shared glass capsule, so pushed pages show the same
 * bare chevron as the conversation's own header. Pair it with `headerLeft` (Android/web).
 */
export function stackBackItem(element: ReactElement) {
  return { type: "custom" as const, element, hidesSharedBackground: true };
}

/**
 * Header options for a screen that replaces the stack's back action. iOS reads
 * `unstable_headerLeftItems` (which overrides `headerLeft`), other platforms `headerLeft`; set both
 * so a custom back never falls back to the root default on one platform.
 */
export function stackBackOptions(element: ReactElement | undefined) {
  return {
    headerLeft: element ? () => element : undefined,
    unstable_headerLeftItems: element ? () => [stackBackItem(element)] : undefined,
  };
}
