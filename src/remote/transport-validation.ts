import {
  HOST_PROTOCOL_VERSION,
  knownRemoteProviders,
  protocolMismatchMessage,
} from "../../../src/features/connections/model/protocol";
import type { HostDescriptor } from "./types";
import { isLanAddress, isLanKey } from "../../../src/integrations/mobile-lan";
import {
  HOST_HTTP_MAX_RESPONSE_BYTES,
  HOST_RESULT_TOO_LARGE_CODE,
} from "../../../src/shared/model/host-contracts/response-limit";

/** Address, identity, payload and error-text validation for the host transport. */
export const MAX_RESPONSE_BYTES = HOST_HTTP_MAX_RESPONSE_BYTES;

/**
 * Whether a Host error envelope says the command ran but its result did not fit one response.
 * The outcome is unknown to the phone: recover through the receipt, never send it again.
 */
export function isUndeliveredResult(envelope: { code?: unknown; delivery?: unknown }): boolean {
  return envelope.code === HOST_RESULT_TOO_LARGE_CODE && envelope.delivery === "unknown";
}

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

export function safeHostMessage(value: string, credential?: string): string {
  return (credential ? value.split(credential).join("…") : value)
    .replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer …")
    .replace(/\b(token|password|passphrase|secret|credential)\s*[=:]\s*\S+/gi, "$1 …")
    .replace(/([?&](?:access_token|token|key|secret|password)=)[^&#\s]*/gi, "$1…")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1…@")
    .slice(0, 400);
}

/** Structured marker the Host sends when a request names another environment. */
export const HOST_IDENTITY_MISMATCH_CODE = "HOST_IDENTITY_MISMATCH";

/**
 * Whether a Host error envelope reports an environment identity mismatch. The explicit code is
 * authoritative. Only an envelope without any code falls back to the exact text older Hosts sent;
 * a different code, or unrelated messages that merely mention "identity changed", stay ordinary
 * Host errors so they never force a re-pair.
 */
export function isHostIdentityMismatch(envelope: { code?: unknown }, message: string): boolean {
  if (typeof envelope.code === "string") return envelope.code === HOST_IDENTITY_MISMATCH_CODE;
  return /^Host identity changed\b/.test(message);
}

export function requireMobileHostDescriptor(value: unknown): HostDescriptor {
  if (!value || typeof value !== "object") throw new Error("Invalid host description.");
  const host = value as HostDescriptor;
  const mismatch = protocolMismatchMessage(host.protocolVersion, HOST_PROTOCOL_VERSION);
  if (mismatch) throw new Error(mismatch);
  // Providers this build does not know are dropped, never fatal: a Host that
  // gained a provider stays reachable from an older phone build.
  const providers = knownRemoteProviders(host.providers);
  if (
    typeof host.environmentId !== "string" ||
    !host.environmentId ||
    typeof host.name !== "string" ||
    !providers ||
    !Array.isArray(host.capabilities) ||
    !host.capabilities.every((capability) => typeof capability === "string")
  )
    throw new Error("This computer is running an incompatible bycoda Host.");
  if (host.platform !== undefined && !["win32", "darwin", "linux"].includes(host.platform))
    throw new Error("Invalid host platform.");
  return providers.length === host.providers.length ? host : { ...host, providers };
}
