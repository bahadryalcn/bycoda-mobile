import {
  HOST_PROTOCOL_VERSION,
  REMOTE_PROVIDERS,
} from "../../../src/features/connections/model/protocol";
import type { HostDescriptor } from "./types";
import { isLanAddress, isLanKey } from "../../../src/integrations/mobile-lan";

/** Address, identity, payload and error-text validation for the host transport. */
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export function normalizeHostEndpoint(input: string, lanKey?: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid bycoda Host HTTPS address.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (
    lanKey !== undefined &&
    (!isLanKey(lanKey) || url.protocol !== "http:" || !isLanAddress(url.hostname))
  )
    throw new Error("Scan a valid local network pairing code.");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && (loopback || (isLanAddress(url.hostname) && isLanKey(lanKey))))
  )
    throw new Error(
      "Remote bycoda connections require HTTPS. Use the computer’s trusted HTTPS proxy address.",
    );
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Use the host address without credentials, a path, query or fragment.");
  return url.origin;
}

export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > MAX_RESPONSE_BYTES) return bytes;
  }
  return bytes;
}

export function safeHostMessage(value: string, credential: string): string {
  return value
    .split(credential)
    .join("…")
    .replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer …")
    .replace(/\b(token|password|passphrase|secret|credential)\s*[=:]\s*\S+/gi, "$1 …")
    .replace(/([?&](?:access_token|token|key|secret|password)=)[^&#\s]*/gi, "$1…")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1…@")
    .slice(0, 400);
}

export function requireMobileHostDescriptor(value: unknown): HostDescriptor {
  if (!value || typeof value !== "object") throw new Error("Invalid host description.");
  const host = value as HostDescriptor;
  if (
    host.protocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof host.environmentId !== "string" ||
    !host.environmentId ||
    typeof host.name !== "string" ||
    !Array.isArray(host.providers) ||
    !host.providers.every((provider) => REMOTE_PROVIDERS.includes(provider)) ||
    !Array.isArray(host.capabilities) ||
    !host.capabilities.every((capability) => typeof capability === "string")
  )
    throw new Error("This computer is running an incompatible bycoda Host.");
  if (host.platform !== undefined && !["win32", "darwin", "linux"].includes(host.platform))
    throw new Error("Invalid host platform.");
  return host;
}
