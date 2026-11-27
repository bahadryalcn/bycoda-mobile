import type { Block } from "@/domain/types";
import type { DeviceSummary } from "../tools/types";
import { currentTurn } from "./run-status-model";

/**
 * The single adapter between the Host's "who holds this" data and the session activity bar.
 * Hosts that report `heldBy` (capabilities below) are trusted; older Hosts fall back to the
 * session's own transcript tool blocks, and anything neither source backs up is not shown.
 */
export const DEVICE_HOLDER_CAPABILITY = "devices.holder.v1";
export const BROWSER_HOLDER_CAPABILITY = "browser.holder.v1";

export type HeldDevice = { deviceId?: string; inferred: boolean };
export type HeldBrowser = { url?: string; inferred: boolean };
export type SessionHolders = { device?: HeldDevice; browser?: HeldBrowser };

const heldBySession = (value: unknown, sessionId: string) => {
  const holder = (value as { heldBy?: { kind?: unknown; sessionId?: unknown } } | null | undefined)?.heldBy;
  return holder?.kind === "session" && holder.sessionId === sessionId;
};

/** First device in a `devices.list` result that this session's agent holds. */
export function heldDeviceFrom(devices: readonly DeviceSummary[] | undefined, sessionId: string): DeviceSummary | undefined {
  return devices?.find((device) => heldBySession(device, sessionId));
}

/** `browser.status` result when this session's agent holds the shared browser. */
export function heldBrowserFrom(status: unknown, sessionId: string): { url?: string } | undefined {
  if (!heldBySession(status, sessionId)) return undefined;
  const url = (status as { url?: unknown }).url;
  return { url: typeof url === "string" && url ? url : undefined };
}

// Tool names arrive as titles such as "mcp__workspace-tools__device_open"; match the name, not a substring of another.
const tool = (name: string) => new RegExp(`(?:^|[^a-z0-9])(?:${name})(?![a-z0-9_])`, "i");
const DEVICE_OPEN = tool("device_open"), DEVICE_CLOSE = tool("device_close");
const BROWSER_OPEN = tool("preview_open|preview_navigate|browser_open|browser_navigate"), BROWSER_CLOSE = tool("preview_close|browser_close");
const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/i;

const nameOf = (block: Block) => [block.text, block.tool?.title, block.tool?.kind].filter(Boolean).join(" ");
const failed = (block: Block) => ["error", "failed", "denied", "rejected", "cancelled", "canceled"].includes(block.tool?.status?.toLowerCase() ?? "");

/** Latest unclosed open/close in the running turn; nothing when idle, so an ended run never claims a device. */
export function inferHolders(blocks: readonly Block[] | undefined, live: boolean): SessionHolders {
  if (!live || !blocks) return {};
  let device = false, browser = false, url: string | undefined;
  for (const block of currentTurn(blocks)) {
    if (block.role !== "tool" || failed(block)) continue;
    const name = nameOf(block);
    if (DEVICE_OPEN.test(name)) device = true;
    else if (DEVICE_CLOSE.test(name)) device = false;
    if (BROWSER_OPEN.test(name)) {
      browser = true;
      url = URL_PATTERN.exec([name, block.tool?.detail].filter(Boolean).join(" "))?.[0] ?? url;
    } else if (BROWSER_CLOSE.test(name)) { browser = false; url = undefined; }
  }
  return { ...(device ? { device: { inferred: true } } : {}), ...(browser ? { browser: { url, inferred: true } } : {}) };
}

export type ResolveHolders = {
  capabilities: readonly string[] | undefined;
  sessionId: string;
  live: boolean;
  blocks: readonly Block[] | undefined;
  /** Loaded `devices.list` devices; undefined until the Host answers. */
  devices: readonly DeviceSummary[] | undefined;
  /** Loaded `browser.status` result; undefined until the Host answers. */
  browserStatus: unknown;
};

/** Host data where the Host reports holders, transcript inference where it does not. */
export function resolveHolders(input: ResolveHolders): SessionHolders {
  if (!input.live) return {};
  const inferred = inferHolders(input.blocks, true);
  const device = input.capabilities?.includes(DEVICE_HOLDER_CAPABILITY)
    ? ((held) => (held ? { deviceId: held.id, inferred: false } : undefined))(heldDeviceFrom(input.devices, input.sessionId))
    : inferred.device;
  const browser = input.capabilities?.includes(BROWSER_HOLDER_CAPABILITY)
    ? ((held) => (held ? { url: held.url, inferred: false } : undefined))(heldBrowserFrom(input.browserStatus, input.sessionId))
    : inferred.browser;
  return { ...(device ? { device } : {}), ...(browser ? { browser } : {}) };
}

/** Polling while the session's turn shows a device or browser in use, or the last read saw it held. */
export const HOLDER_ACTIVE_POLL_MS = 6_000;
/** With no sign of use, a slow safety read still notices a hold taken some other way. */
export const HOLDER_IDLE_POLL_MS = 30_000;

/**
 * Holder reads stay quick only while there is evidence of use; most runs never touch a device or
 * browser, and `devices.list` is a heavy Host call, so idle runs read rarely.
 */
export function holderPollInterval(kind: "device" | "browser", blocks: readonly Block[] | undefined, held: boolean): number {
  if (held) return HOLDER_ACTIVE_POLL_MS;
  return inferHolders(blocks, true)[kind] ? HOLDER_ACTIVE_POLL_MS : HOLDER_IDLE_POLL_MS;
}

/** "localhost:5173" for a page URL; undefined when it is not one. */
export function browserHostLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).host || undefined; } catch { return undefined; }
}
