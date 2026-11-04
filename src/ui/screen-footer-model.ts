import { fontSize, metrics, space } from "./tokens";

/** Spend the actual scene, after fixed chrome, between readable form and actions. */
export function screenFooterLimits(height: number, fontScale: number, header = 0) {
  const frame = Number.isFinite(height) && height > 0 ? height : 0;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const chrome = Number.isFinite(header) ? Math.max(0, header) : 0;
  const available = Math.max(0, frame - chrome);
  const input = Math.max(metrics.inputHeight, fontSize.input * scale + space.md * 2);
  const bodyMinimum = Math.min(available / 2, input + space.screen + space.lg);
  return { bodyMinimum, maximum: Math.max(0, available - bodyMinimum) };
}
