type PlatformAvailability = { platform: string; available: boolean; reason?: string | null };

/** Preserve platform identity while coalescing the same discovery reason once. */
export function deviceAvailabilityIssues(
  errors: readonly string[],
  platforms: readonly PlatformAvailability[],
  unavailable: string,
) {
  const missing = platforms.filter((platform) => !platform.available);
  const covered = new Set(missing.flatMap(({ platform, reason }) => {
    const text = reason?.trim();
    return text ? [text, `${platform}: ${text}`] : [];
  }));
  return [...new Set([
    ...errors.map((error) => error.trim()).filter((error) => error && !covered.has(error)),
    ...missing.map(({ platform, reason }) => `${platform}: ${reason?.trim() || unavailable}`),
  ])];
}
