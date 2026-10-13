export type OverlayState<T> = { value: T; visible: boolean; generation: number };

export function showOverlay<T>(previous: OverlayState<T> | undefined, value: T): OverlayState<T> {
  return {
    value,
    visible: true,
    generation: (previous?.generation ?? 0) + (previous?.visible ? 0 : 1),
  };
}

export function closeOverlay<T>(entry: OverlayState<T>): OverlayState<T> {
  return entry.visible ? { ...entry, visible: false, generation: entry.generation + 1 } : entry;
}

export function canRemoveOverlay<T>(entry: OverlayState<T> | undefined, generation: number) {
  return !!entry && !entry.visible && entry.generation === generation;
}
