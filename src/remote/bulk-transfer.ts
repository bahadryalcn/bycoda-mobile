import { bytesToHex } from "@noble/hashes/utils.js";
import { parseJsonParts, type JsonDecodeOptions } from "@/state/cooperative-json";
import { nativeSha256 } from "./native-digest";

const SEXTET = new Int8Array(128).fill(-1);
for (const [index, char] of [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].entries())
  SEXTET[char.charCodeAt(0)] = index;
const sextet = (text: string, index: number): number => {
  const code = text.charCodeAt(index);
  return code < 128 ? SEXTET[code] : -1;
};
/** Strict standard base64 (padded, no whitespace), as the previous regex plus atob accepted. */
export class BulkBase64Error extends Error {}

/** Decode one chunk straight into `target`, without an intermediate binary string or per-byte closure. */
export function decodeBase64Into(
  text: string,
  expectedBytes: number,
  target: Uint8Array,
  offset: number,
): void {
  const length = text.length;
  if (length % 4) throw new BulkBase64Error();
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const decoded = (length / 4) * 3 - padding;
  if (decoded !== expectedBytes || offset + decoded > target.length) throw new BulkBase64Error();
  const full = padding ? length - 4 : length;
  let out = offset;
  for (let index = 0; index < full; index += 4) {
    const a = sextet(text, index);
    const b = sextet(text, index + 1);
    const c = sextet(text, index + 2);
    const d = sextet(text, index + 3);
    if ((a | b | c | d) < 0) throw new BulkBase64Error();
    target[out++] = (a << 2) | (b >> 4);
    target[out++] = ((b & 15) << 4) | (c >> 2);
    target[out++] = ((c & 3) << 6) | d;
  }
  if (!padding) return;
  const a = sextet(text, full);
  const b = sextet(text, full + 1);
  const c = padding === 1 ? sextet(text, full + 2) : 0;
  if ((a | b | c) < 0) throw new BulkBase64Error();
  target[out++] = (a << 2) | (b >> 4);
  if (padding === 1) target[out] = ((b & 15) << 4) | (c >> 2);
}

/** Full-buffer SHA-256 computed natively; the exact lowercase hex digest the Host sends. */
export async function bulkDigestHex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await nativeSha256(bytes)));
}

const PART_BYTES = 256 * 1024;
/** Strict UTF-8 then cooperative JSON, so neither step is one long synchronous block. */
export async function parseBulkJson(
  bytes: Uint8Array,
  options: JsonDecodeOptions,
): Promise<unknown> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let sliceStarted = Date.now();
  for (let offset = 0; offset < bytes.length; offset += PART_BYTES) {
    parts.push(decoder.decode(bytes.subarray(offset, offset + PART_BYTES), { stream: true }));
    if (Date.now() - sliceStarted >= 4) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      options.assertCurrent?.();
      sliceStarted = Date.now();
    }
  }
  // A truncated multi-byte sequence must still fail like a one-shot fatal decode.
  parts.push(decoder.decode());
  return parseJsonParts(parts, options);
}
