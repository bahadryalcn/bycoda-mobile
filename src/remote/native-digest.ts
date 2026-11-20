/** Keep non-native consumers and injected transport tests independent of native module startup. */
export const nativeSha256 = async (bytes: Uint8Array): Promise<ArrayBuffer> => {
  const crypto = await import("expo-crypto");
  // Phone bytes are never backed by a SharedArrayBuffer; the DOM digest type only accepts ArrayBuffer views.
  return crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
};
