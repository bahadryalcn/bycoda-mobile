import { requireOptionalNativeModule } from "expo";
export * from "./src/types";
import type { HostSocketNative } from "./src/types";

/** Expo Go/web have no native TLS/credential authority. Never substitute WebSocket. */
export function nativeHostSocket(): HostSocketNative | null {
  return requireOptionalNativeModule<HostSocketNative>("BycodaHostSocket");
}
