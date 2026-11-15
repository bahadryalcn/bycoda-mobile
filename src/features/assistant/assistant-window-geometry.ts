export type AssistantWindowPoint = { x: number; y: number };
export type AssistantWindowBounds = { left: number; right: number; top: number; bottom: number };
export type AssistantWindowViewport = {
  width: number; height: number; windowWidth: number; windowHeight: number;
  top: number; bottom: number; left: number; right: number; bottomInset: number; keyboardHeight: number;
};
const within = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Bounds describe the window origin, accounting for its measured size and occluded bottom edge. */
export function assistantWindowBounds(view: AssistantWindowViewport): AssistantWindowBounds {
  const left = view.left + 8, top = view.top + 8;
  return { left, top,
    right: Math.max(left, view.width - view.right - 8 - view.windowWidth),
    bottom: Math.max(top, view.height - Math.max(view.keyboardHeight, view.bottom + view.bottomInset) - 8 - view.windowHeight),
  };
}
export function clampAssistantWindow(point: AssistantWindowPoint, bounds: AssistantWindowBounds): AssistantWindowPoint {
  return { x: within(Number.isFinite(point.x) ? point.x : bounds.left, bounds.left, bounds.right), y: within(Number.isFinite(point.y) ? point.y : bounds.top, bounds.top, bounds.bottom) };
}
export function normalizeAssistantWindow(point: AssistantWindowPoint, bounds: AssistantWindowBounds): AssistantWindowPoint {
  const clamped = clampAssistantWindow(point, bounds);
  return { x: bounds.right > bounds.left ? (clamped.x - bounds.left) / (bounds.right - bounds.left) : 0,
    y: bounds.bottom > bounds.top ? (clamped.y - bounds.top) / (bounds.bottom - bounds.top) : 0 };
}
export function restoreAssistantWindow(point: AssistantWindowPoint, bounds: AssistantWindowBounds): AssistantWindowPoint {
  return clampAssistantWindow({ x: bounds.left + point.x * (bounds.right - bounds.left), y: bounds.top + point.y * (bounds.bottom - bounds.top) }, bounds);
}
/** Position only: no thread, account, transcript or other private content is persisted here. */
export function readAssistantWindowPosition(raw: string | null): AssistantWindowPoint | undefined {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<AssistantWindowPoint> | null;
    if (!value || typeof value.x !== "number" || typeof value.y !== "number" || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
    return { x: within(value.x, 0, 1), y: within(value.y, 0, 1) };
  } catch { return; }
}
