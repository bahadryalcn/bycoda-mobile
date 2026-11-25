import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export function readGzipBase64(value: string): string {
  return strFromU8(gunzipSync(Uint8Array.from(atob(value), (char) => char.charCodeAt(0))));
}

/**
 * Gzip + base64 of the composed log. Synchronous on purpose: fflate's async API needs Web Workers,
 * which React Native does not have; a few hundred KB of text compresses in milliseconds.
 */
export function gzipBase64(text: string): string {
  const bytes = gzipSync(strToU8(text), { level: 6 });
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
