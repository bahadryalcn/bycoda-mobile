/** The step a touch at `x` points to on a track of `width`; always an integer inside 0..count-1. */
export function stepAt(x: number, width: number, count: number): number {
  if (count < 2 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

/** Bar height as a share of the track: the first step is a stub, the last fills it. */
export function barRatio(index: number, count: number): number {
  const floor = 0.3;
  return count < 2 ? 1 : floor + ((1 - floor) * index) / (count - 1);
}

