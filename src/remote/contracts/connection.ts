import type { HostDescriptor, RemoteProvider } from "./host";

export type MobileMachine = {
  id: string;
  name: string;
  endpoint: string;
  lanKey?: string;
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
