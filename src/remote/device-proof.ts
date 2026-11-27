import {
  base64urlDecode,
  base64urlEncode,
  deviceProofKeyFromSeed,
  signDeviceProof,
  type DeviceProofJwk,
} from "../../../src/integrations/device-proof";
import { proofRandomBytes } from "./device-proof-random";

export { DEVICE_PROOF_CAPABILITY, DEVICE_PROOF_HEADER } from "../../../src/integrations/device-proof";

/** Exact transport messages; `ui/error-message.ts` translates them. */
export const DEVICE_PROOF_REQUIRED_MESSAGE =
  "This computer must confirm this phone over the local network or Tailscale first. Connect there once, or pair this computer again.";
export const DEVICE_PROOF_INVALID_MESSAGE =
  "This computer could not verify this phone's device key. Check the phone's date and time, then reconnect or pair again.";

/** Which proof refusal an error message from `HostTransport` carries, if any. */
export function proofRefusalOf(error: unknown): "required" | "invalid" | undefined {
  const message = error instanceof Error ? error.message : undefined;
  return message === DEVICE_PROOF_REQUIRED_MESSAGE
    ? "required"
    : message === DEVICE_PROOF_INVALID_MESSAGE
      ? "invalid"
      : undefined;
}

/** A fresh 32-byte Ed25519 seed. Persist it in SecureStore before the first request that uses it. */
export const newProofSeed = (): Uint8Array => proofRandomBytes(32);

/** The SecureStore form of a seed: 43 base64url characters. */
export const encodeProofSeed = (seed: Uint8Array): string => base64urlEncode(seed);

export function decodeProofSeed(value: string | null | undefined): Uint8Array | null {
  if (typeof value !== "string" || value.length !== 43) return null;
  const bytes = base64urlDecode(value);
  return bytes?.length === 32 ? bytes : null;
}

/** The public JWK the Host binds a credential to (`proofKey` at pairing and `devices.bindProofKey`). */
export const proofKeyOf = (seed: Uint8Array): DeviceProofJwk => deviceProofKeyFromSeed(seed).publicJwk;

/** One proof for one request; a fresh jti and iat every call. `path` is the request path without query. */
export function signRequestProof(input: {
  seed: Uint8Array;
  token: string;
  method: string;
  path: string;
  environmentId: string;
  /** The credential is not saved on this phone yet; see `DeviceProofClaims.unsaved`. */
  unsaved?: boolean;
}): string {
  return signDeviceProof({ ...input, jti: base64urlEncode(proofRandomBytes(16)) });
}

/** Whether the Host refused the request for its device proof (HTTP header, or the LAN envelope body). */
export function isProofRefusal(stage: string | null | undefined, body?: unknown): boolean {
  if (stage === "proof" || stage === "proof-required") return true;
  if (!body || typeof body !== "object") return false;
  const reason = (body as { reason?: unknown }).reason;
  return reason === "proof-required" || reason === "invalid-proof" || reason === "replayed-proof";
}
