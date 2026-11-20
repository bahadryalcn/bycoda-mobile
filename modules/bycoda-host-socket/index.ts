import type { ComponentType, Ref } from "react";
import { requireNativeView, requireOptionalNativeModule } from "expo";
export * from "./src/types";
import type {
  HostSocketNative,
  NativeTunnelEvent,
  TunnelStartInput,
  TunnelStarted,
  TunnelWebViewCommands,
  TunnelWebViewProps,
} from "./src/types";

/** Expo Go/web have no native TLS/credential authority. Never substitute WebSocket. */
export function nativeHostSocket(): HostSocketNative | null {
  return requireOptionalNativeModule<HostSocketNative>("BycodaHostSocket");
}

/** False in Expo Go/web, on older native builds, and where the platform cannot scope a proxy. */
export function tunnelSupported(): boolean {
  try {
    return nativeHostSocket()?.tunnelSupported?.() === true;
  } catch {
    return false;
  }
}

export function startTunnel(input: TunnelStartInput): Promise<TunnelStarted> {
  const native = nativeHostSocket();
  if (!native?.startTunnel) return Promise.reject(new Error("The phone tunnel is not available."));
  return native.startTunnel(input);
}

export function stopTunnel(tunnelId: string): Promise<void> {
  const native = nativeHostSocket();
  return native?.stopTunnel ? native.stopTunnel(tunnelId) : Promise.resolve();
}

export function onTunnelEvent(listener: (event: NativeTunnelEvent) => void): { remove(): void } {
  const native = nativeHostSocket();
  if (!native) return { remove() {} };
  const subscribe = native.addListener as unknown as (
    event: "onTunnelEvent",
    listener: (event: NativeTunnelEvent) => void,
  ) => { remove(): void };
  return subscribe.call(native, "onTunnelEvent", listener);
}

export type TunnelWebViewComponent = ComponentType<
  TunnelWebViewProps & { ref?: Ref<TunnelWebViewCommands> }
>;
let tunnelWebView: TunnelWebViewComponent | null | undefined;
/** The native view, or null when the module/view is not registered (Expo Go, web, tests). */
export function tunnelWebViewComponent(): TunnelWebViewComponent | null {
  if (tunnelWebView !== undefined) return tunnelWebView;
  try {
    tunnelWebView = tunnelSupported()
      ? (requireNativeView("BycodaHostSocket", "BycodaTunnelWebView") as TunnelWebViewComponent)
      : null;
  } catch {
    tunnelWebView = null;
  }
  return tunnelWebView;
}
