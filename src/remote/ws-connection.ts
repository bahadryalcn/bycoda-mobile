import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  BulkResultSchema,
  ConnectionHelloResultSchema,
  JsonValueSchema,
  RpcResponseSchema,
  RPC_ERROR_CODES,
  SubscriptionEventSchema,
  SubscriptionOpenResultSchema,
  WS_LIMITS,
  getHostRpcMethod,
  nativeDesktopMethod,
  hostRpcCost,
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
  | "overload"
  | "unavailable"
  | "internal"
  | "validation"
  | "unsupported";
const failureMessages: Record<HostWsFailure, string> = {
  authentication: "Computer access was denied. Reconnect this computer.",
  identity: "Host identity changed. Pair this computer again.",
  schema: "The mobile app and Host use incompatible data. Update both and reconnect.",
  tls: "The computer certificate could not be verified. Reconnect this computer.",
  network: "This computer could not be reached. Check its connection and try again.",
  deadline: "This computer took too long to answer. Try again.",
  cancelled: "Request cancelled.",
  overload: "This computer is busy. Try again shortly.",
  unavailable: "This computer is not ready for this request. Try again shortly.",
  internal: "The computer could not complete this request. Try again.",
  validation: "The computer rejected this request. Check its details and try again.",
  unsupported: "This Host does not support this operation. Update the Host and reconnect.",
};
/** Below the Host's maxPendingRpc (64), leaving room for control and ack frames. */
const IN_FLIGHT_LIMIT = 48;
/**
 * Below the Host's 8 concurrent control requests per socket (stream open/ack/close). Thirty-two
 * project streams opening at once otherwise get "busy", and a refused ack drops the socket.
 */
const CONTROL_IN_FLIGHT_LIMIT = 6;
const QUEUE_LIMIT = 512;
/** A rejected RPC is not evidence of malformed wire data or a broken socket. */
function rpcFailure(code: number, category?: string): HostWsFailure {
  if (category && Object.hasOwn(failureMessages, category)) return category as HostWsFailure;
  switch (code) {
    case RPC_ERROR_CODES.unauthorized:
      return "authentication";
    case RPC_ERROR_CODES.wrongEnvironment:
      return "identity";
    case RPC_ERROR_CODES.overloaded:
      return "overload";
    case RPC_ERROR_CODES.deadlineExceeded:
      return "deadline";
    case RPC_ERROR_CODES.cancelled:
      return "cancelled";
    case RPC_ERROR_CODES.notReady:
    case RPC_ERROR_CODES.resyncRequired:
      return "unavailable";
    case RPC_ERROR_CODES.methodNotFound:
      return "unsupported";
    case RPC_ERROR_CODES.parseError:
    case RPC_ERROR_CODES.invalidRequest:
      return "schema";
    case RPC_ERROR_CODES.invalidParams:
      return "validation";
    default:
      return "internal";
  }
}
export class HostWsError extends Error {
  constructor(
    readonly category: HostWsFailure,
    readonly uncertain = false,
    readonly commandId?: string,
  ) {
    super(
      uncertain
        ? "Connection interrupted. Check this command's result before trying again."
        : failureMessages[category],
    );
  }
}
export type HostWsRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
type Pending = {
  method: string;
  /** Counts against the Host's per-socket control limit (stream open/ack/close). */
  control: boolean;
  commandId?: string;
  subscriptionId?: string;
  sent: boolean;
  resolving: boolean;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  detach(): void;
};
type StreamCursor = SubscriptionEvent["params"]["cursor"];
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
  // A local handle the native side dropped (app backgrounded, access epoch moved) is
  // not a Host authorization failure: re-acquire it from SecureStore and reconnect.
  if (
    /credential_handle_expired|credentials_invalidated|access.changed|Host socket: unavailable/i.test(
      message,
    )
  )
    return new HostWsError("unavailable");
  if (/credential|secure.store|authentication/i.test(message))
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
  /** Requests waiting for an in-flight slot; the Host rejects more than 64 pending RPCs. */
  private waiting: { control: boolean; run: () => void; fail: (error: HostWsError) => void }[] = [];
  private nextId = 0;
  private listener: { remove(): void } | undefined;
  private closed = false;
  private ready = false;
  private allowedMethods = new Set<string>();
  private hostCapabilities: readonly string[] = [];
  private bulkJobs = 0;
  private bulkBytes = 0;
  private bulkWaiters: (() => void)[] = [];
  private eventTails = new Map<string, Promise<void>>();
  private streamIdentities = new Map<string, string>();
  private eventGuards = new Map<string, { valid: boolean; jobs: number }>();
  private pendingInvalidations = new Set<string>();
  /** Malformed frames dropped on this connection. */
  droppedFrames = 0;
  private acks = new Map<string, { inflight: boolean; latest?: StreamCursor }>();
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
      // Native credit releases bridge buffers only (the server cursor ACK happens after
      // the reducer/cache commit). Release it on receipt: a frame whose processing waits
      // on a later frame would otherwise starve the credit and close the socket "overload".
      if (event.type === "message" && Number.isSafeInteger(event.sequence))
        void this.native
          .acknowledge(this.connectionId, this.generation, event.sequence!)
          .catch(() => undefined);
      void this.receive(event)
        .catch((error) => {
          // One undecodable frame is dropped, not treated as an auth/credential failure.
          // Stream gaps resync through the cursor check; stalled requests hit their deadline.
          if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
            this.droppedFrames++;
            console.warn(`Dropped malformed Host frame (${this.droppedFrames} so far).`);
            return;
          }
          this.fail(error instanceof HostWsError ? error : new HostWsError("schema"));
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
    const control = hostRpcCost(method, params) === "control";
    if (!this.waiting.some((entry) => entry.control === control) && this.canSend(control))
      return this.perform(method, params, options) as Promise<T>;
    if (this.waiting.length >= QUEUE_LIMIT) return Promise.reject(new HostWsError("overload"));
    // A screen with many projects fans out more reads than the Host accepts at once;
    // queue them (nothing is sent yet, so this never replays or reorders a write).
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        reject(new HostWsError("cancelled"));
      };
      const entry = {
        control,
        run: () => {
          options.signal?.removeEventListener("abort", onAbort);
          try {
            (this.perform(method, params, options) as Promise<T>).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
        },
        fail: (error: HostWsError) => {
          options.signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      };
      this.waiting.push(entry);
      options.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  private canSend(control: boolean): boolean {
    if (this.pending.size >= IN_FLIGHT_LIMIT) return false;
    if (!control) return true;
    let controls = 0;
    for (const pending of this.pending.values()) if (pending.control) controls++;
    return controls < CONTROL_IN_FLIGHT_LIMIT;
  }
  /** FIFO per class: a waiting control request never blocks reads, and controls keep their order. */
  private drainWaiting(): void {
    let controlBlocked = false;
    for (let index = 0; !this.closed && index < this.waiting.length; ) {
      const entry = this.waiting[index]!;
      if ((entry.control && controlBlocked) || !this.canSend(entry.control)) {
        if (!entry.control || this.pending.size >= IN_FLIGHT_LIMIT) return;
        controlBlocked = true;
        index++;
        continue;
      }
      this.waiting.splice(index, 1);
      entry.run();
    }
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
        control: hostRpcCost(method, parsed) === "control",
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
      if (this.waiting.length) queueMicrotask(() => this.drainWaiting());
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
              // Inline data was validated with the frame; only hydrated bulk bytes are new input.
              ...(data === undefined
                ? {}
                : {
                    data:
                      data === notification.params.data
                        ? notification.params.data
                        : JsonValueSchema.parse(data),
                  }),
            },
          },
          assertDeliveryCurrent,
        ).catch((error) => {
          if (!guard.valid) return false;
          throw error;
        });
        if (!guard.valid) return;
        assertDeliveryCurrent();
        // Ack off the pipeline: the next event applies without waiting for the Host's reply.
        if (applied && ["snapshot", "delta"].includes(notification.params.kind))
          this.queueAck(id, notification.params.streamId, notification.params.cursor);
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
      rejected.reject(
        this.pendingError(rejected, rpcFailure(response.error.code, response.error.data?.category)),
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
  /** At most one ack in flight per subscription; newer cursors replace queued ones (cursors only advance). */
  private queueAck(subscriptionId: string, streamId: string, cursor: StreamCursor): void {
    const state = this.acks.get(subscriptionId) ?? { inflight: false };
    state.latest = cursor;
    this.acks.set(subscriptionId, state);
    if (state.inflight) return;
    const pump = () => {
      const next = state.latest;
      if (!next || this.closed) {
        if (!state.inflight) this.acks.delete(subscriptionId);
        return;
      }
      state.latest = undefined;
      state.inflight = true;
      this.request("subscriptions.ack", { subscriptionId, cursor: next }).then(
        () => {
          state.inflight = false;
          pump();
        },
        (error) => {
          state.inflight = false;
          this.acks.delete(subscriptionId);
          if (this.closed || this.streamIdentities.get(subscriptionId) !== streamId) return;
          this.fail(error instanceof HostWsError ? error : new HostWsError("network"));
        },
      );
    };
    pump();
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
    if (descriptor.totalBytes > MAX_BULK_BYTES) throw new HostWsError("overload");
    // Wait for a slot instead of failing: summary polls keep two downloads busy most of the
    // time, and rejecting a third left a large transcript permanently "busy".
    while (this.bulkJobs >= 2 || this.bulkBytes + descriptor.totalBytes > 2 * MAX_BULK_BYTES) {
      await new Promise<void>((resolve) => this.bulkWaiters.push(resolve));
      this.assertCurrent();
      if (!needed()) throw new HostWsError("cancelled");
      if (Date.now() >= descriptor.expiresAt) throw new HostWsError("deadline");
    }
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
      for (const wake of this.bulkWaiters.splice(0)) wake();
    }
  }
  private fail(error: HostWsError): void {
    if (this.closed) return;
    this.close(error.category);
    this.onFailure(error);
  }
  close(reason: HostWsFailure = "network"): void {
    if (this.closed) return;
    this.closed = true;
    for (const wake of this.bulkWaiters.splice(0)) wake();
    this.ready = false;
    this.eventTails.clear();
    for (const guard of this.eventGuards.values()) guard.valid = false;
    this.eventGuards.clear();
    this.streamIdentities.clear();
    this.pendingInvalidations.clear();
    this.acks.clear();
    this.listener?.remove();
    this.listener = undefined;
    for (const entry of this.waiting.splice(0)) entry.fail(new HostWsError(reason));
    for (const id of this.pending.keys()) {
      const pending = this.take(id)!;
      pending.reject(this.pendingError(pending, reason));
    }
    void this.native.close(this.connectionId, this.generation).catch(() => undefined);
  }
}
