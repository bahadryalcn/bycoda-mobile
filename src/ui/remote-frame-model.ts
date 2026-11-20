export type FrameSize = { width: number; height: number };

/** A payload size is known only when both sides are positive whole pixel counts; anything else is unknown. */
export function knownFrameSize(width?: number, height?: number): FrameSize | undefined {
  return width !== undefined && height !== undefined &&
    Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

/** The displayed image has the source ratio, so native touch coordinates map directly. */
export function framePoint(x: number, y: number, display: FrameSize, source: FrameSize) {
  if (![x, y, display.width, display.height, source.width, source.height].every(Number.isFinite) ||
      display.width <= 0 || display.height <= 0 || source.width <= 0 || source.height <= 0 ||
      x < 0 || y < 0 || x > display.width || y > display.height) return undefined;
  return {
    x: Math.min(source.width - 1, Math.max(0, Math.round(x * source.width / display.width))),
    y: Math.min(source.height - 1, Math.max(0, Math.round(y * source.height / display.height))),
  };
}
