/** The step a touch at `x` points to on a track of `width`; always an integer inside 0..count-1. */
export function stepAt(x: number, width: number, count: number): number {
  if (count < 2 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

/** The step one accessibility increment or decrement moves from `from`, clamped to 0..count-1. */
export function nudgeStep(from: number, delta: number, count: number): number {
  return Math.min(count - 1, Math.max(0, from + delta));
}

/**
 * The step a level control shows and nudges from. `accepted` is the last step the owner was asked
 * to store, tagged with the value prop it was requested from. While the prop still holds that value
 * the write has not landed yet, so the accepted step wins; once the prop moves, the prop's own step
 * is authoritative again (the owner confirmed or rejected the write).
 */
export function shownStep(accepted: { from: string; step: number } | undefined, value: string, index: number): number {
  return accepted && accepted.from === value ? accepted.step : index;
}

/** Bar height as a share of the track: the first step is a stub, the last fills it. */
export function barRatio(index: number, count: number): number {
  const floor = 0.3;
  return count < 2 ? 1 : floor + ((1 - floor) * index) / (count - 1);
}

