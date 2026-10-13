/** Keep non-native consumers and injected transport tests independent of native module startup. */
export const nativeRandomBytes = async (size: number): Promise<Uint8Array> =>
  (await import("expo-crypto")).getRandomBytesAsync(size);
