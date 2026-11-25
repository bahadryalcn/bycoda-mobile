import type { HostDescriptor, RemoteProvider } from "./host";

/**
 * One way to reach a computer: a pinned local-network or tailnet listener (`lanKey`) or an HTTPS
 * address. `public` marks a tunnel reachable from the whole internet that the owner allowed on the
 * computer; it is HTTPS only, never keyed, and used last.
 */
export type MobileRoute = { endpoint: string; lanKey?: string; public?: true };

export type MobileMachine = {
  id: string;
  name: string;
  /** The route currently in use. Always one of `routes` when those are saved. */
  endpoint: string;
  lanKey?: string;
  /** The route in use is a public-internet tunnel. */
  public?: true;
  /** Every paired route for this computer, e.g. local network and Tailscale. */
  routes?: MobileRoute[];
  environmentId: string;
  platform?: HostDescriptor["platform"];
  providers?: RemoteProvider[];
  capabilities?: string[];
  lastConnectedAt?: number;
};

export type RemoteRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Only known read operations can retry. Writes are never replayed automatically. */
  retry?: boolean;
};

export type RemoteErrorKind =
  | "auth"
  | "identity"
  | "network"
  | "timeout"
  | "protocol"
  | "host"
  | "unsupported"
  | "aborted";

export type HostRequest = <T>(
  method: string,
  params?: Record<string, unknown>,
  options?: RemoteRequestOptions,
) => Promise<T>;
