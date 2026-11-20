export type Size = { width: number; height: number };
export type PanLimits = { x: number; y: number };

/** The image shown with `contain` inside the viewport. Without a known natural size the viewport stands in for it. */
export function fittedSize(view: Size, natural: Size): Size {
  "worklet";
  if (natural.width <= 0 || natural.height <= 0 || view.width <= 0 || view.height <= 0) return view;
  const fit = Math.min(view.width / natural.width, view.height / natural.height);
  return { width: natural.width * fit, height: natural.height * fit };
}

/** Largest offset that keeps the scaled image's edges on the viewport; a smaller image cannot be panned away. */
export function panLimits(view: Size, natural: Size, scale: number): PanLimits {
  "worklet";
  const shown = fittedSize(view, natural);
  return {
    x: Math.max(0, (shown.width * scale - view.width) / 2),
    y: Math.max(0, (shown.height * scale - view.height) / 2),
  };
}

export function clampPan(value: number, limit: number): number {
  "worklet";
  return Math.min(limit, Math.max(-limit, value));
}
