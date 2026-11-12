/** Full-jitter exponential delay: uniform in [0, min(capMs, baseMs * 2^attempt)]. */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
  baseMs = 500,
  capMs = 30_000,
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.min(Math.max(attempt, 0), 16));
  return Math.floor(Math.max(0, Math.min(1, random())) * ceiling);
}
