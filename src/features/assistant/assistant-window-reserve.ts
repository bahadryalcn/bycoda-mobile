import { create } from "zustand";

/**
 * Bottom space the minimized assistant window occupies while it rests at the bottom edge. Screens add
 * it to their bottom inset so the window never covers their last rows or their primary action.
 */
export const useAssistantWindowReserve = create<{ reserve: number }>(() => ({ reserve: 0 }));

/** Only a window resting in the lower half covers bottom content; one dragged up needs no room. */
export function assistantWindowReserve(visible: boolean, relativeY: number, height: number, gap: number): number {
  return visible && relativeY > 0.5 && Number.isFinite(height) && height > 0 ? Math.ceil(height + gap) : 0;
}
