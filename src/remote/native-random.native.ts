import { getRandomBytesAsync } from "expo-crypto";

/** Preserve native secure randomness without loading a Metro chunk during the LAN handshake. */
export const nativeRandomBytes = getRandomBytesAsync;
