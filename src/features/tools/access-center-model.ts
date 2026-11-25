import type { HostAccessReport } from "../../../../host/security/access/access-center";
import { matchesSearch } from "@/ui/search-matching";
export type { HostAccessReport };
export type PairedDevice = HostAccessReport["devices"][number];
export type AccessTarget = { machineId: string; environmentId: string };
/** Keep this phone first without changing the report used for reviewed actions. */
export function visibleAccessDevices(devices: readonly PairedDevice[], query: string, locale?: string) {
  return devices.filter(device => matchesSearch(`${device.name} ${device.id}`, query, locale))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const allowed = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\r\n\0]/.test(value);
const accessStates = ["ready", "setup-required", "unavailable"];
export function localTunnelUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || value.length > 1024)
    throw new Error("Enter a credential-free loopback HTTP or HTTPS address.");
  return url.origin;
}
function safePublicUrl(provider: unknown, value: unknown) {
  if (typeof value !== "string" || value.length > 1024) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !url.port && url.pathname === "/" &&
    (provider === "cloudflare" ? /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/ : /^[a-z0-9-]+\.(?:ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev|ngrok\.io)$/).test(url.hostname); }
  catch { return false; }
}
/** Reject extra identity material before the safe read enters mobile query state. */
export function readAccessCenter(value: unknown, environmentId: string): HostAccessReport {
  const invalid = () => { throw new Error("Invalid safe host access report"); };
  const state = (item: unknown) => record(item) && allowed(item, ["state"]) && accessStates.includes(String(item.state));
  if (!record(value) || !allowed(value, ["environmentId", "sampledAt", "devices", "devicesTruncated", "lan", "privateNetwork", "tunnels"]) || !text(value.environmentId, 256) || value.environmentId !== environmentId ||
    !Number.isSafeInteger(value.sampledAt) || Number(value.sampledAt) < 0 || Number(value.sampledAt) > 8640000000000000 || typeof value.devicesTruncated !== "boolean" || !Array.isArray(value.devices) || value.devices.length > 256 ||
    !value.devices.every((row) =>
      record(row) && allowed(row, ["id", "name", "isCurrent", "canManageDevices", "isLocalDesktop"]) &&
      text(row.id, 128) && text(row.name, 160) && typeof row.isCurrent === "boolean" &&
      (row.canManageDevices === undefined || typeof row.canManageDevices === "boolean") &&
      (row.isLocalDesktop === undefined || typeof row.isLocalDesktop === "boolean")) ||
    new Set(value.devices.map((row) => row.id)).size !== value.devices.length || !state(value.lan) || !state(value.privateNetwork)) return invalid();
  if (value.tunnels !== null) {
    const tunnels = value.tunnels;
    if (!record(tunnels) || !allowed(tunnels, ["providers", "tunnels", "publicReachability"]) || tunnels.publicReachability !== "unverified" || !Array.isArray(tunnels.providers) || tunnels.providers.length > 2 ||
      !tunnels.providers.every((row) => record(row) && allowed(row, ["provider", "installed", "credential"]) && ["ngrok", "cloudflare"].includes(String(row.provider)) && typeof row.installed === "boolean" && ["saved", "missing", "unavailable", "not-required"].includes(String(row.credential))) ||
      !Array.isArray(tunnels.tunnels) || tunnels.tunnels.length > 32 || !tunnels.tunnels.every((row) => {
        if (!record(row) || !allowed(row, ["id", "provider", "target", "state", "startedAt", "localUrl", "publicUrl", "canStop", "issue"]) || !text(row.id, 128) || !["ngrok", "cloudflare"].includes(String(row.provider)) || !["host", "dev-server"].includes(String(row.target)) ||
          !["starting", "ready", "stopping", "stopped", "error", "interrupted"].includes(String(row.state)) || !Number.isSafeInteger(row.startedAt) || Number(row.startedAt) < 0 || Number(row.startedAt) > 8640000000000000 || typeof row.canStop !== "boolean" || typeof row.localUrl !== "string" || row.issue !== undefined && !text(row.issue, 64)) return false;
        try { localTunnelUrl(row.localUrl); } catch { return false; }
        return row.publicUrl === undefined || safePublicUrl(row.provider, row.publicUrl);
      }) || new Set(tunnels.tunnels.map((row) => row.id)).size !== tunnels.tunnels.length || new Set(tunnels.providers.map((row) => row.provider)).size !== tunnels.providers.length) return invalid();
  }
  return value as HostAccessReport;
}
export function deviceRevokeIntent(device: PairedDevice) {
  if (!text(device.id, 128)) throw new Error("Refresh paired devices before continuing.");
  return device.isCurrent ? { method: "devices.revokeSelf", params: {} } : { method: "devices.revokeOther", params: { id: device.id } };
}
/** Stopped tunnels are history, not access: only live or failed tunnels are listed on the phone. */
export function activeAccessTunnels<T extends { state: string }>(tunnels: readonly T[]): T[] {
  return tunnels.filter(tunnel => tunnel.state !== "stopped");
}
