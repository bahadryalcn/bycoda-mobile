import type { HostDescriptor, RemoteProvider } from "./host";

/** One way to reach a computer: a pinned local-network listener or an HTTPS address. */
export type MobileRoute = { endpoint: string; lanKey?: string };

export type MobileMachine = {
  id: string;
  name: string;
  /** The route currently in use. Always one of `routes` when those are saved. */
  endpoint: string;
  lanKey?: string;
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
