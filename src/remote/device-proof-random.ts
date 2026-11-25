/** Web, Node and test runtimes: the standard secure random source. */
export const proofRandomBytes = (size: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(size));
