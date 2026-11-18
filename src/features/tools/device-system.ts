import type { DeviceSummary } from "./types";

const PLATFORM_NAMES: Record<string, string> = { android: "Android", ios: "iOS" };

/** "Android 16" style label; hosts may report the platform id and a version that repeats it. */
export function deviceSystemLabel(device: Pick<DeviceSummary, "platform" | "version">): string {
  const platform = device.platform ? PLATFORM_NAMES[device.platform.toLowerCase()] ?? device.platform : "";
  const version = device.version?.trim() ?? "";
  if (!version || version.toLowerCase().startsWith(platform.toLowerCase())) return version || platform;
  return [platform, version].filter(Boolean).join(" ");
}
