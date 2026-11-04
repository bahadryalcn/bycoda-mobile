/** Reserve an eight-em identity measure before spending space on tree indentation. */
export function hierarchyLayout({ width, depth, step, reservedWidth, typeSize }: {
  width: number; depth: number; step: number; reservedWidth: number; typeSize: number;
}) {
  const positive = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const desired = Math.floor(positive(depth)) * positive(step);
  const available = Math.max(0, positive(width) - positive(reservedWidth));
  const minimum = Math.min(available, positive(typeSize) * 8);
  const indent = Math.min(desired, Math.max(0, available - minimum));
  return { indent, compressed: desired - indent > 0.5 };
}
