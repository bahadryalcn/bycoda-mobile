export const SECURE_STORE_VERSION: "57.0.4";
export type BridgeChange = { file: string; anchor: string; addition: string };
export const bridgeChanges: BridgeChange[];
export function bridgeSource(version: string, source: string, change: BridgeChange): string;
export function verifySecureStoreBridge(secureStoreFolder: string): string;
