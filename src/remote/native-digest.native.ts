import { CryptoDigestAlgorithm, digest } from "expo-crypto";

/** Hash protected bulk bytes natively instead of in a pure-JS loop on the UI thread. */
export const nativeSha256 = (bytes: Uint8Array): Promise<ArrayBuffer> =>
  // Phone bytes are never backed by a SharedArrayBuffer; the DOM digest type only accepts ArrayBuffer views.
  digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
