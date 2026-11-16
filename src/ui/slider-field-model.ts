/** Decimal places a step needs, so 0.05-style steps never leave float noise such as 1.1500000000000001. */
function stepDecimals(step: number): number {
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Number(exponent[1]);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Clamp `value` into `[min, max]` and snap it to the nearest `step` from `min`; non-finite input falls back to `min`. */
export function snapSliderValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value) || max <= min) return min;
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  const places = Math.max(stepDecimals(step), stepDecimals(min));
  return Math.min(max, Number(snapped.toFixed(places)));
}

/** Number of distinct positions on a stepped track, for accessibility value text and tests. */
export function sliderPositionCount(min: number, max: number, step: number): number {
  return max > min && step > 0 ? Math.floor((max - min) / step + 1e-9) + 1 : 1;
}
