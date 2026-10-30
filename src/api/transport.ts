import type { HostConnection, HostDescriptor } from "../domain/types";
import { ApprovalCommandRefused, assertApprovalCommand } from "../domain/approval-command";
import { isApprovalOccurrenceId } from "../../../src/shared/model/approvalOccurrence";
import {
  HostTransport as RemoteTransport,
  RemoteHostError,
  normalizeHostEndpoint,
} from "../remote/transport";

export type HostErrorKind =
  | "authentication"
  | "identity"
  | "timeout"
  | "disconnected"
  | "cancelled"
  | "protocol"
  | "host";
export class HostError extends Error {
  constructor(
    public readonly kind: HostErrorKind,
    message: string,
    public readonly machineId: string,
    public readonly uncertain = false,
  ) {
    super(message);
    this.name = "HostError";
  }
}
export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export type FetchLike = typeof fetch;

/** Compatibility surface shares the canonical HTTPS, identity and error rules. */
export class HostTransport {
  private active = new Set<AbortController>();
  private closed = false;
  private identity?: string;
  private capabilities: string[] = [];
  private remote: RemoteTransport;
  readonly endpoint: string;
  readonly connection: HostConnection;
  constructor(
    connection: HostConnection,
    private readonly fetcher?: FetchLike,
    private readonly credentialReader?: () => Promise<string | null>,
    private readonly assertAccess?: () => void,
  ) {
    try {
      this.endpoint = normalizeHostEndpoint(connection.endpoint, connection.lanKey);
    } catch {
      throw new HostError(
        "protocol",
        "Use a trusted HTTPS host address without credentials, path or query.",
        connection.id,
      );
    }
    this.connection = Object.freeze({ ...connection, endpoint: this.endpoint });
    this.identity = connection.environmentId;
    this.remote = this.createRemote();
  }
  private createRemote() {
    return new RemoteTransport(
      {
        id: this.connection.id,
        name: this.connection.id,
        endpoint: this.endpoint,
        lanKey: this.connection.lanKey,
        environmentId: this.identity ?? "",
        capabilities: this.capabilities,
      },
      this.credentialReader ?? (async () => this.connection.token),
      this.fetcher,
      this.assertAccess,
    );
  }
  acceptIdentity(identity: string) {
    if (!identity || (this.identity && this.identity !== identity))
      throw new HostError(
        "identity",
        "Host identity changed. Pair this computer again.",
        this.connection.id,
      );
    this.identity = identity;
    this.remote.dispose();
    this.remote = this.createRemote();
  }
  disconnect() {
    this.closed = true;
    this.remote.dispose();
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
  reconnect() {
    this.closed = false;
    this.remote = this.createRemote();
  }
  /** Compatibility reads retain the canonical guard during cooperative decoding. */
  assertCurrentAccess(): void {
    if (this.closed)
      throw new HostError("disconnected", "This computer is disconnected.", this.connection.id);
    try {
      this.remote.assertCurrentAccess();
    } catch (error) {
      throw new HostError(
        "authentication",
        error instanceof RemoteHostError
          ? error.message
          : "Unlock the app before connecting to this computer.",
        this.connection.id,
      );
    }
  }
  async request<T>(method: string, params: object = {}, options: RequestOptions = {}): Promise<T> {
    const id = this.connection.id;
    if (this.closed) throw new HostError("disconnected", "This computer is disconnected.", id);
    if (
      (method === "commands.dispatch" && (params as { type?: unknown }).type === "approve") ||
      method === "crews.respond"
    ) {
      // Snapshot caller primitives before the descriptor read. It grants no new occurrence.
      params = { ...params };
      const approval = { ...params, type: "approve" };
      if (
        !isApprovalOccurrenceId((params as { approvalOccurrenceId?: unknown }).approvalOccurrenceId)
      )
        throw new ApprovalCommandRefused("unidentified");
      const descriptor = await this.request<HostDescriptor>("environment.describe", {}, options);
      assertApprovalCommand(descriptor.capabilities, approval);
    }
    const controller = new AbortController();
    this.active.add(controller);
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const result = await this.remote.request<T>(method, params as Record<string, unknown>, {
        ...options,
        signal: controller.signal,
        timeoutMs: options.timeoutMs ?? 30_000,
        retry: false,
      });
      if (
        method === "environment.describe" &&
        result &&
        typeof result === "object" &&
        "capabilities" in result &&
        Array.isArray(result.capabilities)
      )
        this.capabilities.splice(
          0,
          this.capabilities.length,
          ...result.capabilities.filter(
            (capability): capability is string => typeof capability === "string",
          ),
        );
      return result;
    } catch (error) {
      if (error instanceof ApprovalCommandRefused) throw error;
      if (!(error instanceof RemoteHostError))
        throw new HostError("disconnected", "Cannot reach this computer.", id);
      const kinds = {
        auth: "authentication",
        identity: "identity",
        timeout: "timeout",
        network: "disconnected",
        aborted: this.closed ? "disconnected" : "cancelled",
        protocol: "protocol",
        unsupported: "host",
        host: "host",
      } as const;
      throw new HostError(kinds[error.kind], error.message, id, error.uncertain);
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      this.active.delete(controller);
    }
  }
}
