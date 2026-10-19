import { boundedResponseText } from "./response-body";
import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { nativeRandomBytes } from "./native-random";
import {
  isLanKey,
  lanContext,
  MOBILE_LAN_MAX_BYTES,
  MOBILE_LAN_MAX_WIRE_BYTES,
  readLanEnvelope,
} from "../../../src/integrations/mobile-lan";

const boundedText = (response: Response, limit: number) =>
  boundedResponseText(response, limit, () => new Error("Local network response too large."));

/** HTTP carries only ciphertext. The host key is pinned by the owner-created QR. */
export function encryptedLanFetch(
  fetcher: typeof fetch,
  environmentId: string,
  serverKey: string,
  randomBytes = nativeRandomBytes,
  assertAccess?: () => void,
): typeof fetch {
  if (!environmentId || !isLanKey(serverKey))
    throw new Error("Scan a new local network pairing code.");
  return async (address, init) => {
    const url = new URL(String(address));
    if (
      (url.pathname !== "/rpc" && url.pathname !== "/mobile/pairing/redeem") ||
      init?.method !== "POST" ||
      typeof init.body !== "string"
    )
      throw new Error("Unsupported local network request.");
    assertAccess?.();
    const hello = await fetcher(`${url.origin}/mobile/lan/hello`, {
      method: "GET",
      signal: init.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    if (!hello.ok || Number(hello.headers.get("content-length")) > 256)
      throw new Error("Local network connection unavailable.");
    const helloText = await boundedText(hello, 256);
    const challenge = JSON.parse(helloText);
    if (challenge.version !== 1 || !isLanKey(challenge.epoch))
      throw new Error("Invalid local network challenge.");
    const privateKey = await randomBytes(32);
    const id = bytesToHex(await randomBytes(32));
    const publicKey = bytesToHex(x25519.getPublicKey(privateKey));
    const shared = x25519.getSharedSecret(privateKey, hexToBytes(serverKey));
    privateKey.fill(0);
    const context = (direction: "request" | "response") =>
      utf8ToBytes(lanContext(environmentId, serverKey, publicKey, id, direction));
    const key = (direction: "request" | "response") =>
      hkdf(sha256, shared, hexToBytes(id), context(direction), 32);
    const token = new Headers(init.headers)
      .get("Authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const payload = utf8ToBytes(
      JSON.stringify({
        epoch: challenge.epoch,
        time: Date.now(),
        path: url.pathname,
        token,
        body: init.body,
      }),
    );
    if (payload.length > MOBILE_LAN_MAX_BYTES + 1024)
      throw new Error("Local network request too large.");
    const data = bytesToHex(
      gcm(key("request"), new Uint8Array(12), context("request")).encrypt(payload),
    );
    try {
      assertAccess?.();
      if (init.signal?.aborted) throw new Error("Local network request cancelled.");
      const response = await fetcher(`${url.origin}/mobile/lan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, id, publicKey, data }),
        signal: init.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      assertAccess?.();
      if (
        !response.ok ||
        Number(response.headers.get("content-length")) > MOBILE_LAN_MAX_WIRE_BYTES
      )
        throw new Error("Local network connection rejected.");
      // Expo's streaming fetch supports bounded reads before decrypting large replies.
      const text = await boundedText(response, MOBILE_LAN_MAX_WIRE_BYTES);
      const envelope = readLanEnvelope(JSON.parse(text));
      if (envelope.id !== id || envelope.publicKey !== publicKey)
        throw new Error("Local network response identity changed.");
      const plain = gcm(key("response"), new Uint8Array(12), context("response")).decrypt(
        hexToBytes(envelope.data),
      );
      const value = JSON.parse(new TextDecoder().decode(plain));
      if (
        !Number.isInteger(value.status) ||
        value.status < 200 ||
        value.status > 599 ||
        typeof value.body !== "string" ||
        utf8ToBytes(value.body).length > MOBILE_LAN_MAX_BYTES
      )
        throw new Error("Invalid local network response.");
      return new Response(value.body, {
        status: value.status,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      shared.fill(0);
      payload.fill(0);
    }
  };
}
