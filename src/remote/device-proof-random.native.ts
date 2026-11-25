import { getRandomBytes } from "expo-crypto";

/** Synchronous native secure random bytes; Hermes has no `crypto.getRandomValues`. */
export const proofRandomBytes = (size: number): Uint8Array => getRandomBytes(size);
