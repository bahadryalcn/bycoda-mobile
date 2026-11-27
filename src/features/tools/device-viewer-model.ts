import type { DevServer, DeviceSummary } from "./types";

/** Host capability: scaled viewer frames plus the back, app switcher and rotate actions. */
export const DEVICE_VIEWER_CAPABILITY = "devices.viewer.v2";

/** A phone shows a device screen a few hundred points wide; more pixels only slow every frame. */
const MAX_VIEW_EDGE = 1080;
const MIN_VIEW_EDGE = 320;

/** Longest frame edge worth transferring for this viewer area, in device pixels. */
export function viewerFrameEdge(area: { width: number; height: number }, pixelRatio: number): number {
  const longest = Math.max(area.width, area.height) * (Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 2);
  return Math.round(Math.min(MAX_VIEW_EDGE, Math.max(MIN_VIEW_EDGE, longest || MAX_VIEW_EDGE)));
}

/** Why the screen cannot be shown, when the computer told us something the user can fix. */
export function frameBlocker(error: unknown): "service-stopped" | "device-off" | undefined {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/device hub is stopped/i.test(message)) return "service-stopped";
  if (/boot the device before/i.test(message)) return "device-off";
  return undefined;
}

const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const APPLE_BUNDLE = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/** The Host's own rule for an app target, checked while typing so Open app can say what is wrong. */
export function appTargetValid(value: string, platform: DeviceSummary["platform"]): boolean {
  const target = value.trim();
  if (!target || target.length > 256) return false;
  if (platform === "android") return target.toLowerCase() === "settings" || ANDROID_PACKAGE.test(target);
  return APPLE_BUNDLE.test(target);
}

/** Common system apps offered before anything was opened; recent IDs come first. */
export function suggestedApps(platform: DeviceSummary["platform"]): string[] {
  return platform === "android"
    ? ["com.android.settings", "com.android.chrome", "host.exp.exponent"]
    : ["com.apple.Preferences", "com.apple.mobilesafari", "host.exp.Exponent"];
}

/** The readable name of a suggested system app, or undefined for an ID the person typed. */
export function knownAppName(id: string, copy: (tr: string, en: string) => string): string | undefined {
  switch (id) {
    case "com.android.settings":
    case "com.apple.Preferences":
      return copy("Ayarlar", "Settings");
    case "com.android.chrome":
      return "Chrome";
    case "com.apple.mobilesafari":
      return "Safari";
    case "host.exp.exponent":
    case "host.exp.Exponent":
      return "Expo Go";
    default:
      return undefined;
  }
}

const recent = new Map<string, string[]>();
/** App IDs opened from this phone in this run, per computer and platform; newest first. */
export function recentApps(machineId: string | undefined, platform: DeviceSummary["platform"]): string[] {
  return recent.get(`${machineId ?? ""}:${platform}`) ?? [];
}
export function rememberApp(machineId: string | undefined, platform: DeviceSummary["platform"], app: string) {
  const key = `${machineId ?? ""}:${platform}`;
  recent.set(key, [app, ...(recent.get(key) ?? []).filter((value) => value !== app)].slice(0, 5));
}

/**
 * Running dev servers of this project that can be previewed, Expo/Metro first. The URL is the
 * computer's own address, which is what the preview opens.
 */
export function previewServerUrls(servers: readonly DevServer[], projectId: string): { name: string; url: string }[] {
  const expo = (server: DevServer) =>
    /\b(expo|metro|react-native)\b/i.test(`${server.command ?? ""} ${server.name}`) ||
    server.endpoints.some((endpoint) => endpoint.port === 8081);
  return servers
    .filter((server) => server.projectId === projectId && server.association !== "uncertain" && server.state === "running")
    .sort((a, b) => Number(expo(b)) - Number(expo(a)))
    .flatMap((server) => server.endpoints.slice(0, 1).map((endpoint) => ({ name: server.name, url: endpoint.url })))
    .filter((item, index, all) => /^(https?|exps?):\/\//i.test(item.url) && all.findIndex((other) => other.url === item.url) === index)
    .slice(0, 4);
}
