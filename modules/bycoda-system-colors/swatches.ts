export type SystemColorSwatches = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  surface: string;
  surfaceVariant: string;
  onSurface: string;
  onSurfaceVariant: string;
};

/** Reject incomplete or opaque PlatformColor objects before palette arithmetic. */
export function parseSystemColorSwatches(value: unknown): SystemColorSwatches | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "surface", "surfaceVariant", "onSurface", "onSurfaceVariant"] as const;
  if (!keys.every(key => typeof record[key] === "string" && /^#[0-9a-f]{6}$/i.test(record[key]))) return null;
  return Object.fromEntries(keys.map(key => [key, record[key]])) as SystemColorSwatches;
}
