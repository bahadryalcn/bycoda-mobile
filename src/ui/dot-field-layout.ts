export const DOT_STEP = 26;
export const DOT_SIZE = 5;
/** Field width over the screen width, so the parallax shift never shows an edge. */
export const DOT_SPAN = 1.3;

export type Dot = { x: number; y: number; level: number; seed: number };

/** Fixed seed: the field is the same on every launch, like a texture. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** The website's guide-tour field: sparse square dots, gathered in a few vertical streams, mostly faint. */
export function dotLayout(width: number, height: number): Dot[] {
  const next = random(61);
  const cols = Math.ceil((width * DOT_SPAN) / DOT_STEP), rows = Math.ceil(height / DOT_STEP);
  const streams = new Set(Array.from({ length: Math.ceil(cols * 0.3) }, () => Math.floor(next() * cols)));
  const dots: Dot[] = [];
  for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) {
    if (next() > (streams.has(col) ? 0.45 : 0.04)) continue;
    dots.push({ x: col * DOT_STEP + (DOT_STEP - DOT_SIZE) / 2, y: row * DOT_STEP + (DOT_STEP - DOT_SIZE) / 2, level: 0.08 + next() ** 4 * 0.6, seed: next() });
  }
  return dots;
}
