import type { AutoLockTimeoutMs } from "./security-types";

export const autoLockTimeoutOptions = [
  0, 30_000, 60_000, 300_000, 900_000,
] as const;
export const securityPreferenceKey = "bycoda.mobile.app-lock.v2";
export const legacySecurityPreferenceKey = "bycoda.mobile.app-lock.v1";

export type SecurityPreferences = {
  enabled: boolean;
  autoLockTimeoutMs: AutoLockTimeoutMs;
};

export function isAutoLockTimeout(value: unknown): value is AutoLockTimeoutMs {
  return autoLockTimeoutOptions.some((option) => option === value);
}

export function parseSecurityPreferences(value: string): SecurityPreferences {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    parsed.version !== 2 ||
    !("enabled" in parsed) ||
    typeof parsed.enabled !== "boolean" ||
    !("autoLockTimeoutMs" in parsed) ||
    !isAutoLockTimeout(parsed.autoLockTimeoutMs)
  )
    throw new Error("Invalid security preferences");
  return {
    enabled: parsed.enabled,
    autoLockTimeoutMs: parsed.autoLockTimeoutMs,
  };
}

export function encodeSecurityPreferences(preferences: SecurityPreferences) {
  return JSON.stringify({ version: 2, ...preferences });
}

export function migrateSecurityPreference(
  value: string | null,
  available: boolean,
) {
  if (value !== null && value !== "on" && value !== "off")
    throw new Error("Invalid legacy security preference");
  return {
    enabled: value === "on" || (value === null && available),
    autoLockTimeoutMs: 0,
  } as const;
}

export type SuspensionTime = { wall: number; monotonic: number };

export function suspensionTime(): SuspensionTime {
  return {
    wall: Date.now(),
    monotonic: globalThis.performance?.now() ?? Number.NaN,
  };
}

export function isWithinLockGrace(
  started: SuspensionTime,
  current: SuspensionTime,
  timeoutMs: AutoLockTimeoutMs,
) {
  const wallElapsed = current.wall - started.wall;
  const monotonicElapsed = current.monotonic - started.monotonic;
  // Fail closed on clock reversal, unavailable clocks or a clock adjustment.
  // Comparing both clocks also counts device sleep where monotonic time pauses.
  return (
    timeoutMs > 0 &&
    Number.isFinite(wallElapsed) &&
    Number.isFinite(monotonicElapsed) &&
    wallElapsed >= 0 &&
    monotonicElapsed >= 0 &&
    Math.abs(wallElapsed - monotonicElapsed) <= 1_000 &&
    Math.max(wallElapsed, monotonicElapsed) < timeoutMs
  );
}
