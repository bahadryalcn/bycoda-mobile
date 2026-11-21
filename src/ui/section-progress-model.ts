export function readingProgressPercent(offset: number, viewport: number, content: number): number {
  "worklet";
  if (viewport <= 0 || content <= 0) return 0;
  const distance = content - viewport;
  if (distance <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, offset / distance)) * 100);
}
