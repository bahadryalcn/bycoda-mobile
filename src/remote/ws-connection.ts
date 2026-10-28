import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  BulkResultSchema,
  ConnectionHelloResultSchema,
  JsonValueSchema,
  RpcResponseSchema,
  SubscriptionEventSchema,
  SubscriptionOpenResultSchema,
  WS_LIMITS,
  getHostRpcMethod,
  nativeDesktopMethod,
  hostRpcSupported,
  parseHostRpcParams,
  type BulkDescriptor,
  type JsonObject,
  type SubscriptionEvent,
} from "../../../src/shared/model/host-contracts";
import type {
  CredentialBinding,
  HostSocketNative,
  NativeCredentialHandle,
  NativeSocketEvent,
} from "../../modules/bycoda-host-socket/src/types";

export type HostWsFailure =
  | "authentication"
  | "identity"
  | "schema"
  | "tls"
  | "network"
  | "deadline"
  | "cancelled"
  | "overload";
export class HostWsError extends Error {
  constructor(
    readonly category: HostWsFailure,
    readonly uncertain = false,
    readonly commandId?: string,
  ) {
    super(
      uncertain
        ? "Connection interrupted. Check this command's result before trying again."
        : `Host connection: ${category}.`,
    );
  }
}
export type HostWsRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
type Pending = {
  method: string;
  commandId?: string;
  subscriptionId?: string;
  sent: boolean;
  resolving: boolean;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  detach(): void;
};
export type AppliedHostEvent = (
  event: SubscriptionEvent,
  assertCurrent: () => void,
) => Promise<boolean>;
const MAX_BULK_BYTES = 32 * 1024 * 1024;
/** Match JSON object serialization of existing optional params, without coercion. */
function wireParams(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new HostWsError("schema");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((child) => wireParams(child, depth + 1));
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, wireParams(child, depth + 1)]),
    );
  throw new HostWsError("schema");
}
function nativeFailure(error: unknown): HostWsError {
  if (error instanceof HostWsError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/credential|secure.store|access.changed|authentication/i.test(message))
    return new HostWsError("authentication");
  if (/\btls\b|certificate|\btrust\b/i.test(message)) return new HostWsError("tls");
  if (/schema|ZodError/i.test(message) || (error instanceof Error && error.name === "ZodError"))
    return new HostWsError("schema");
  return new HostWsError("network");
}

/** One native connection attempt. This class never retries or changes transport. */
export class MobileHostWsConnection {
  readonly connectionId: string;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private listener: { remove(): void } | undefined;
  private closed = false;
  private ready = false;
  private allowedMethods = new Set<string>();
  private hostCapabilities: readonly string[] = [];
  private bulkJobs = 0;
  private bulkBytes = 0;
  private eventTails = new Map<string, Promise<void>>();
  private streamIdentities = new Map<string, string>();
  private eventGuards = new Map<string, { valid: boolean; jobs: number }>();
  private pendingInvalidations = new Set<string>();
  constructor(
    private readonly native: HostSocketNative,
    readonly binding: CredentialBinding,
    private readonly credential: NativeCredentialHandle,
    readonly generation: number,
    readonly clientId: string,
    private readonly applyEvent: AppliedHostEvent = async () => false,
    private readonly onFailure: (error: HostWsError) => void = () => undefined,
    private readonly assertAccess: () => void = () => undefined,
  ) {
    this.connectionId = `mobile:${clientId}:${generation}`;
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      this.connectionId.length > 200 ||
      credential.machineId !== binding.machineId ||
      credential.environmentId !== binding.environmentId ||
      credential.credentialGeneration !== binding.credentialGeneration ||
      credential.accessEpoch !== binding.accessEpoch
    )
      throw new HostWsError("identity");
  }
  async start(): Promise<void> {
    if (this.listener || this.closed) throw new HostWsError("schema");
    this.assertAccess();
    this.listener = this.native.addListener("onSocketEvent", (event) => {
      if (
        event.connectionId !== this.connectionId ||
        event.generation !== this.generation ||
        this.closed
      )
        return;
      if (event.environmentId !== this.binding.environmentId) {
        this.fail(new HostWsError("identity"));
        return;
      }
      void this.receive(event)
        .catch((error) =>
          this.fail(error instanceof HostWsError ? error : new HostWsError("schema")),
        )
        .finally(() => {
          // Native credit releases bridge buffers only. Server cursor ACK happens
          // separately, after the application's successful reducer/cache commit.
          if (event.type === "message" && Number.isSafeInteger(event.sequence))
            void this.native
              .acknowledge(this.connectionId, this.generation, event.sequence!)
              .catch(() => undefined);
        });
    });
    try {
      await this.native.open(this.credential.handle, this.connectionId, this.generation);
      this.assertCurrent();
      const hello = ConnectionHelloResultSchema.parse(
        await this.perform("connection.hello", {
          environmentId: this.binding.environmentId,
          supportedWireVersions: [2],
          supportedSchemaVersions: [1],
          clientId: this.clientId,
          clientKind: "mobile",
        }),
      );
      if (hello.environmentId !== this.binding.environmentId) throw new HostWsError("identity");
      this.allowedMethods = new Set(hello.methods);
      this.hostCapabilities = hello.capabilities;
      this.ready = true;
    } catch (error) {
      this.close();
      throw nativeFailure(error);
    }
  }
  private assertCurrent(): void {
    this.assertAccess();
    if (this.closed) throw new HostWsError("network");
  }
  request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: HostWsRequestOptions = {},
  ): Promise<T> {
    if (!this.supports(method)) return Promise.reject(new HostWsError("schema"));
    return this.perform(method, params, options) as Promise<T>;
  }
  supports(method: string): boolean {
    return (
      !nativeDesktopMethod(method) &&
      this.ready &&
      this.allowedMethods.has(method) &&
      hostRpcSupported(method, this.hostCapabilities)
    );
  }
  private perform(
    method: string,
    params: Record<string, unknown>,
    options: HostWsRequestOptions = {},
  ): Promise<unknown> {
    this.assertCurrent();
    if (options.signal?.aborted) return Promise.reject(new HostWsError("cancelled"));
    if (this.pending.size >= WS_LIMITS.maxPendingRpc)
      return Promise.reject(new HostWsError("overload"));
    const parsed = parseHostRpcParams(method, wireParams(params));
    if (method === "subscriptions.close" && typeof parsed.subscriptionId === "string") {
      const streamId = this.streamIdentities.get(parsed.subscriptionId);
      if (streamId) this.invalidateStream(parsed.subscriptionId, streamId);
    }
    const definition = getHostRpcMethod(method)!;
    const id = `mobile:${this.generation}:${++this.nextId}`;
    const encoded = JSON.stringify({ jsonrpc: "2.0", id, method, params: parsed });
    if (utf8ToBytes(encoded).byteLength > WS_LIMITS.maxMessageBytes)
      return Promise.reject(new HostWsError("overload"));
    const requested = options.timeoutMs ?? definition.responseTimeoutMs;
    const timeout = Number.isFinite(requested)
      ? Math.max(
          WS_LIMITS.minResponseTimeoutMs,
          Math.min(WS_LIMITS.maxResponseTimeoutMs, requested),
        )
      : definition.responseTimeoutMs;
    return new Promise((resolve, reject) => {
      const cancel = (category: "deadline" | "cancelled") => {
        const pending = this.take(id);
        if (!pending) return;
        pending.reject(this.pendingError(pending, category));
        if (pending.sent && !this.closed) this.cancelWait(id);
      };
      const abort = () => cancel("cancelled");
      const pending: Pending = {
        method,
        commandId: typeof parsed.commandId === "string" ? parsed.commandId : undefined,
        subscriptionId:
          typeof parsed.subscriptionId === "string" ? parsed.subscriptionId : undefined,
        sent: false,
        resolving: false,
        resolve,
        reject,
        timer: setTimeout(() => cancel("deadline"), timeout),
        detach: () => options.signal?.removeEventListener("abort", abort),
      };
      this.pending.set(id, pending);
      options.signal?.addEventListener("abort", abort, { once: true });
      // Mark before the native bridge call: a lost bridge acknowledgement does
      // not establish whether bytes crossed the socket.
      pending.sent = true;
      void this.native.send(this.connectionId, this.generation, encoded).catch(() => {
        const failed = this.take(id);
        if (failed) failed.reject(this.pendingError(failed, "network"));
      });
    });
  }
  private pendingError(pending: Pending, category: HostWsFailure): HostWsError {
    return new HostWsError(
      category,
      pending.sent && getHostRpcMethod(pending.method)?.retry !== "safe-query",
      pending.commandId,
    );
  }
  private take(id: string): Pending | undefined {
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.detach();
    }
    return pending;
  }
  private cancelWait(requestId: string): void {
    if (!this.allowedMethods.has("requests.cancel")) return;
    const text = JSON.stringify({
      jsonrpc: "2.0",
      id: `mobile:${this.generation}:${++this.nextId}`,
      method: "requests.cancel",
      params: { requestId },
    });
    void this.native.send(this.connectionId, this.generation, text).catch(() => undefined);
  }
  private async receive(event: NativeSocketEvent): Promise<void> {
    this.assertCurrent();
    if (event.type !== "message") {
      const category: HostWsFailure = ["authentication", "tls", "schema", "overload"].includes(
        event.code ?? "",
      )
        ? (event.code as HostWsFailure)
        : "network";
      this.fail(new HostWsError(category));
      return;
    }
    if (
      typeof event.text !== "string" ||
      utf8ToBytes(event.text).length > WS_LIMITS.maxMessageBytes
    )
      throw new HostWsError("overload");
    const message: unknown = JSON.parse(event.text);
    if (message && typeof message === "object" && "method" in message) {
      const notification = SubscriptionEventSchema.parse(message);
      const id = notification.params.subscriptionId;
      const key = JSON.stringify([id, notification.params.streamId]);
      if (["closed", "resync-required"].includes(notification.params.kind)) {
        const expected = this.streamIdentities.get(id);
        if (expected !== undefined && expected !== notification.params.streamId) return;
        if (
          expected === undefined &&
          [...this.pending.values()].some(
            (request) => request.method === "subscriptions.open" && request.subscriptionId === id,
          )
        ) {
          if (
            !this.pendingInvalidations.has(key) &&
            this.pendingInvalidations.size >= WS_LIMITS.maxSubscriptionsPerSocket
          )
            throw new HostWsError("overload");
          this.pendingInvalidations.add(key);
        }
        // Matching deletion/resnapshot controls bypass queued data. Fence
        // its bulk/commit guards before invoking any application callbacks.
        if (expected !== undefined) this.invalidateStream(id, expected);
        const accepted = await this.applyEvent(notification, () => this.assertCurrent());
        if (accepted) this.invalidateStream(id, notification.params.streamId);
        return;
      }
      if (!this.eventTails.has(id) && this.eventTails.size >= WS_LIMITS.maxSubscriptionsPerSocket)
        throw new HostWsError("overload");
      if (
        !this.eventGuards.has(key) &&
        this.eventGuards.size >= WS_LIMITS.maxSubscriptionsPerSocket
      )
        throw new HostWsError("overload");
      const guard = this.eventGuards.get(key) ?? { valid: true, jobs: 0 };
      guard.jobs++;
      this.eventGuards.set(key, guard);
      const assertDeliveryCurrent = () => {
        this.assertCurrent();
        if (!guard.valid) throw new HostWsError("cancelled");
      };
      const handled = (this.eventTails.get(id) ?? Promise.resolve()).then(async () => {
        if (!guard.valid) return;
        this.assertCurrent();
        let data: unknown;
        try {
          data = await this.resolveBulk(notification.params.data, () => guard.valid);
        } catch (error) {
          if (!guard.valid) return;
          throw error;
        }
        if (!guard.valid) return;
        assertDeliveryCurrent();
        const applied = await this.applyEvent(
          {
            ...notification,
            params: {
              ...notification.params,
              ...(data === undefined ? {} : { data: JsonValueSchema.parse(data) }),
            },
          },
          assertDeliveryCurrent,
        ).catch((error) => {
          if (!guard.valid) return false;
          throw error;
        });
        if (!guard.valid) return;
        assertDeliveryCurrent();
        if (applied && ["snapshot", "delta"].includes(notification.params.kind))
          await this.request("subscriptions.ack", {
            subscriptionId: id,
            cursor: notification.params.cursor,
          });
      });
      this.eventTails.set(id, handled);
      try {
        await handled;
      } finally {
        if (this.eventTails.get(id) === handled) this.eventTails.delete(id);
        guard.jobs--;
        if (!guard.jobs && this.eventGuards.get(key) === guard) this.eventGuards.delete(key);
      }
      return;
    }
    const response = RpcResponseSchema.parse(message);
    if (response.id === null) throw new HostWsError("schema");
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (pending.resolving) throw new HostWsError("schema");
    pending.resolving = true;
    if ("error" in response) {
      const rejected = this.take(response.id)!;
      const category = response.error.data?.category;
      rejected.reject(
        this.pendingError(
          rejected,
          category === "authentication"
            ? "authentication"
            : category === "identity"
              ? "identity"
              : category === "overload"
                ? "overload"
                : "schema",
        ),
      );
      return;
    }
    try {
      const result = await this.resolveBulk(
        response.result,
        () => this.pending.get(response.id!) === pending,
      );
      this.assertCurrent();
      // The domain schema validates the resolved result, never the indirection.
      const parsed = getHostRpcMethod(pending.method)!.resultSchema.parse(result);
      if (pending.method === "subscriptions.open") {
        const opened = SubscriptionOpenResultSchema.parse(parsed);
        if (opened.subscriptionId !== pending.subscriptionId) throw new HostWsError("identity");
        if (
          !this.streamIdentities.has(opened.subscriptionId) &&
          this.streamIdentities.size >= WS_LIMITS.maxSubscriptionsPerSocket
        )
          throw new HostWsError("overload");
        this.streamIdentities.set(opened.subscriptionId, opened.streamId);
        if (this.pendingInvalidations.has(JSON.stringify([opened.subscriptionId, opened.streamId])))
          this.invalidateStream(opened.subscriptionId, opened.streamId);
        for (const key of this.pendingInvalidations)
          if ((JSON.parse(key) as string[])[0] === opened.subscriptionId)
            this.pendingInvalidations.delete(key);
      } else if (pending.method === "subscriptions.close" && pending.subscriptionId)
        this.streamIdentities.delete(pending.subscriptionId);
      const completed = this.take(response.id);
      completed?.resolve(parsed);
    } catch (error) {
      const failed = this.take(response.id);
      if (failed)
        failed.reject(
          this.pendingError(failed, error instanceof HostWsError ? error.category : "schema"),
        );
    }
  }
  private invalidateStream(subscriptionId: string, streamId: string): void {
    const guard = this.eventGuards.get(JSON.stringify([subscriptionId, streamId]));
    if (guard) guard.valid = false;
  }
  private async resolveBulk(value: unknown, needed: () => boolean = () => true): Promise<unknown> {
    if (!value || typeof value !== "object" || !("$bulk" in value)) return value;
    const descriptor = BulkResultSchema.parse(value).$bulk;
    if (descriptor.environmentId !== this.binding.environmentId) throw new HostWsError("identity");
    return this.download(descriptor, needed);
  }
  private async download(descriptor: BulkDescriptor, needed: () => boolean): Promise<unknown> {
    if (
      descriptor.totalBytes > MAX_BULK_BYTES ||
      this.bulkJobs >= 2 ||
      this.bulkBytes + descriptor.totalBytes > 2 * MAX_BULK_BYTES
    )
      throw new HostWsError("overload");
    this.bulkJobs++;
    this.bulkBytes += descriptor.totalBytes;
    try {
      const bytes = new Uint8Array(descriptor.totalBytes);
      const hash = sha256.create();
      for (let offset = 0; offset < bytes.length;) {
        this.assertCurrent();
        if (!needed()) throw new HostWsError("cancelled");
        if (Date.now() >= descriptor.expiresAt) throw new HostWsError("deadline");
        const chunk = await this.native
          .readBulk(this.credential.handle, descriptor, offset)
          .catch((error) => {
            throw nativeFailure(error);
          });
        this.assertCurrent();
        if (!needed()) throw new HostWsError("cancelled");
        if (
          typeof chunk.dataBase64 !== "string" ||
          chunk.dataBase64.length > Math.ceil(descriptor.chunkBytes / 3) * 4 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(chunk.dataBase64)
        )
          throw new HostWsError("schema");
        const decoded = Uint8Array.from(atob(chunk.dataBase64), (char) => char.charCodeAt(0));
        const expected = Math.min(descriptor.chunkBytes, bytes.length - offset);
        if (decoded.length !== expected) throw new HostWsError("schema");
        bytes.set(decoded, offset);
        hash.update(decoded);
        offset += decoded.length;
      }
      if (bytesToHex(hash.digest()) !== descriptor.sha256) throw new HostWsError("schema");
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } finally {
      this.bulkJobs--;
      this.bulkBytes -= descriptor.totalBytes;
    }
  }
  private fail(error: HostWsError): void {
    if (this.closed) return;
    this.close();
    this.onFailure(error);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.eventTails.clear();
    for (const guard of this.eventGuards.values()) guard.valid = false;
    this.eventGuards.clear();
    this.streamIdentities.clear();
    this.pendingInvalidations.clear();
    this.listener?.remove();
    this.listener = undefined;
    for (const id of this.pending.keys()) {
      const pending = this.take(id)!;
      pending.reject(this.pendingError(pending, "network"));
    }
    void this.native.close(this.connectionId, this.generation).catch(() => undefined);
  }
}
