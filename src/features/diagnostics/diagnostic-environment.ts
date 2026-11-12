export type EnvironmentFacts = Record<string, string | number | boolean | null | undefined>;

export const ENVIRONMENT_SECTION = "mobile-environment";

/** `key: value` lines; unknown values are skipped. Callers pass no names, emails or paths. */
export function formatEnvironment(facts: EnvironmentFacts): string {
  return Object.entries(facts)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}`)
    .join("\n");
}

export interface EnvironmentSources {
  appVersion?: string | null;
  buildNumber?: string | null;
  runtimeVersion?: string | null;
  os: string;
  osVersion: string | number;
  brand?: string | null;
  model?: string | null;
  locale?: string | null;
  timeZone?: string | null;
  fontScale?: number;
  colorScheme?: string | null;
  hermes: boolean;
  signedIn: boolean;
  pairedComputers: number;
  hostVersions?: readonly string[];
}

export function collectEnvironment(source: EnvironmentSources): string {
  return formatEnvironment({
    "app-version": source.appVersion,
    "build-number": source.buildNumber,
    "runtime-version": source.runtimeVersion,
    os: `${source.os} ${source.osVersion}`,
    "device-brand": source.brand,
    "device-model": source.model,
    locale: source.locale,
    timezone: source.timeZone,
    "font-scale": source.fontScale === undefined ? undefined : Math.round(source.fontScale * 100) / 100,
    "color-scheme": source.colorScheme,
    hermes: source.hermes,
    "signed-in": source.signedIn,
    "paired-computers": source.pairedComputers,
    ...Object.fromEntries((source.hostVersions ?? []).map((version, index) => ["host-" + (index + 1) + "-version", version])),
  });
}
