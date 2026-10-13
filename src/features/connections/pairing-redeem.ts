import { parseMobilePairingCode, PairingFailure } from "./pairing-code";
import { utf8Bytes } from "@/remote/transport-validation";
import { nativeHostFetch } from "@/remote/native-fetch";
import { encryptedLanFetch } from "@/remote/lan-fetch";
import type { MobilePairingCode } from "./pairing-code";
import type {
  PairingRedeemOptions,
  PairingRedeemResponse,
  PairingRedeemResult,
} from "./connection-types";

const MAX_RESPONSE_BYTES = 8_192;
const validKey = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

async function readBoundedResponse(response: Response, abort: () => void): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    abort();
    throw new PairingFailure("invalid-response");
  }
  const reader = typeof TextDecoder === "function" ? response.body?.getReader?.() : undefined;
  if (!reader) {
    const text = await response.text();
    if (utf8Bytes(text) > MAX_RESPONSE_BYTES) throw new PairingFailure("invalid-response");
    return text;
  }
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        abort();
        throw new PairingFailure("invalid-response");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** One explicit claim; retries use the same claim ID and never redirect a ticket. */
export async function redeemMobilePairingCode(
  input: MobilePairingCode,
  claimId: string,
  deviceName: string,
  options: PairingRedeemOptions,
): Promise<PairingRedeemResult> {
  const code = parseMobilePairingCode(JSON.stringify(input), options.now?.() ?? Date.now());
  if (!validKey(claimId) || !deviceName.trim() || deviceName.length > 120)
    throw new PairingFailure("invalid-response");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, options.timeoutMs ?? 12_000);
  const check = () => {
    if (controller.signal.aborted) throw new PairingFailure(timedOut ? "timeout" : "aborted");
    try {
      options.assertAccess();
    } catch {
      throw new PairingFailure("access");
    }
  };
  try {
    check();
    const nativeFetcher = options.fetchImpl ?? nativeHostFetch;
    const fetcher = code.lanKey
      ? encryptedLanFetch(nativeFetcher, code.environmentId, code.lanKey, undefined, check)
      : nativeFetcher;
    const response = await fetcher(`${code.endpoint}/mobile/pairing/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        environmentId: code.environmentId,
        ticket: code.ticket,
        claimId,
        deviceName: deviceName.trim(),
      }),
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
    check();
    if (!response.ok) {
      if (response.status === 410) throw new PairingFailure("expired");
      if (response.status === 409 || response.status === 401) throw new PairingFailure("used");
      if (response.status === 400) throw new PairingFailure("code-unavailable");
      if (response.status === 429) throw new PairingFailure("rate-limit");
      if (response.status === 404) throw new PairingFailure("unavailable");
      if (response.status >= 500) throw new PairingFailure("network");
      throw new PairingFailure("invalid-response");
    }
    const text = await readBoundedResponse(response, abort);
    check();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new PairingFailure("invalid-response");
    }
    const result = (payload as PairingRedeemResponse | null)?.result;
    if (
      !result ||
      typeof result.deviceId !== "string" ||
      !/^[A-Za-z0-9-]{1,80}$/.test(result.deviceId) ||
      !validKey(result.token) ||
      typeof result.environmentId !== "string"
    ) {
      throw new PairingFailure("invalid-response");
    }
    if (result.environmentId !== code.environmentId) throw new PairingFailure("identity");
    return { deviceId: result.deviceId, token: result.token, environmentId: result.environmentId };
  } catch (error) {
    if (error instanceof PairingFailure) throw error;
    if (controller.signal.aborted) throw new PairingFailure(timedOut ? "timeout" : "aborted");
    throw new PairingFailure("network");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
