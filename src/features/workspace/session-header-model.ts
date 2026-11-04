import { fontSize, space } from "@/ui/tokens";

/** Status needs a readable measure; frequent controls remain in the first row. */
export function sessionStatusInline(width: number, actions: number, fontScale: number) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(actions) || actions <= 0) return false;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return width - actions - space.sm >= fontSize.small * scale * 9;
}
