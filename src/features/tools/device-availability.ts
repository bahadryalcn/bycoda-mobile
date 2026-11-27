/** Readable platform names for the Host's platform identifiers. */
export function devicePlatformName(platform: string): string {
  return platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform;
}

type PlatformAvailability = { platform: string; available: boolean; reason?: string | null };

/** Preserve platform identity while coalescing the same discovery reason once. */
export function deviceAvailabilityIssues(
  errors: readonly string[],
  platforms: readonly PlatformAvailability[],
  unavailable: string,
  /** The platform as people know it ("Android", "iOS"), not the Host's identifier. */
  name: (platform: string) => string = (platform) => platform,
) {
  const missing = platforms.filter((platform) => !platform.available);
  const covered = new Set(missing.flatMap(({ platform, reason }) => {
    const text = reason?.trim();
    return text ? [text, `${platform}: ${text}`] : [];
  }));
  return [...new Set([
    ...errors.map((error) => error.trim()).filter((error) => error && !covered.has(error)),
    ...missing.map(({ platform, reason }) => `${name(platform)}: ${reason?.trim() || unavailable}`),
  ])];
}
