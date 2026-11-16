import {
  HOST_PROTOCOL_VERSION,
  REMOTE_PROVIDERS,
} from "../../../src/features/connections/model/protocol";
import type { HostDescriptor, MobileMachine, RemoteErrorKind, RemoteRequestOptions } from "./types";
import {
  MAX_RESPONSE_BYTES,
  normalizeHostEndpoint,
  requireMobileHostDescriptor,
  utf8Bytes,
  safeHostMessage,
} from "./transport-validation";
import { logDiagnostic } from "../features/diagnostics/diagnostic-log";
import { readonlyRequest } from "./request-policy";
import { RemoteHostError } from "./host-error";
import { nativeHostFetch } from "./native-fetch";
import { encryptedLanFetch } from "./lan-fetch";
import { assertApprovalCommand } from "../domain/approval-command";
import { boundedResponseText } from "./response-body";
import { mobileWsMethodEnabled, selectMobileHostTransport } from "./lan-ws";
import { getHostWsRuntimeProvider, type HostWsConsumer } from "./ws-runtime-port";
import { HostWsError } from "./ws-connection";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { backoffDelayMs } from "./backoff";
import { requestSessionExecution, sessionExecutionMethod } from "./session-execution";
import {
  getHostRpcMethod,
  hostRpcHasEffect,
  DEVICE_LIFECYCLE_METHODS,
  MOBILE_DEVICE_PREVIEW_METHODS,
  NATIVE_DEVICE_METHODS,
  nativeDesktopMethod,
  hostRpcWireMethod,
  WS_LIMITS,
  SubscriptionOpenResultSchema,
  type SubscriptionOpenParamsSchema,
  type SubscriptionEvent,
  type StreamCursor,
} from "../../../src/shared/model/host-contracts";

const DEFAULT_TIMEOUT_MS = 12_000;
/** Access, identity and capability failures cannot be cured by reconnecting. */
function terminalStreamError(error: unknown): boolean {
  if (error instanceof HostWsError)
    return ["authentication", "identity", "tls", "unsupported"].includes(error.category);
  return (
    error instanceof RemoteHostError && ["auth", "identity", "unsupported"].includes(error.kind)
  );
}
const deviceHttpMethods = new Set<string>([
  ...NATIVE_DEVICE_METHODS,
  ...DEVICE_LIFECYCLE_METHODS,
  ...MOBILE_DEVICE_PREVIEW_METHODS,
]);
function deviceHttpEffect(method: string): boolean {
  const definition = deviceHttpMethods.has(method) ? getHostRpcMethod(method) : undefined;
  return !!definition && hostRpcHasEffect(method, definition.kind);
}
let streamIdSequence = 0;
export type MobileStreamTarget = ReturnType<typeof SubscriptionOpenParamsSchema.parse>["target"];
export type MobileStreamSubscription = { close(): void };
export type MobileStreamPhase = "catching-up" | "live";
export type MobileStreamApply = (
  event: SubscriptionEvent,
  assertCurrent: () => void,
) => Promise<boolean | "resync">;

export class HostTransport {
  readonly endpoint: string;
  readonly machine: MobileMachine;
  private wsConsumer?: HostWsConsumer;
  private wsPreparing?: Promise<HostWsConsumer>;
  private wsActive = new Set<AbortController>();
  private streams = new Set<MobileStreamSubscription>();
  private streamReservations = 0;
  private removedTargets = new Set<string>();
  private targetScopeInvalidated = false;
  private disposed = false;
  constructor(
    machine: MobileMachine,
    private readonly readCredential: () => Promise<string | null>,
    private fetchImpl: typeof fetch = nativeHostFetch,
    private readonly assertAccess?: () => void,
  ) {
    this.endpoint = normalizeHostEndpoint(machine.endpoint, machine.lanKey);
    this.machine = Object.freeze({ ...machine, endpoint: this.endpoint });
  }

  async describe(options: RemoteRequestOptions = {}): Promise<HostDescriptor> {
    return this.request<HostDescriptor>(
      "environment.describe",
      { supportedProviders: [...REMOTE_PROVIDERS] },
      options,
    );
  }

  private requireAccess(uncertain = false): void {
    if (this.disposed)
      throw new RemoteHostError(
        this.machine.id,
        "aborted",
        "This computer view was closed.",
        uncertain,
      );
    try {
      this.assertAccess?.();
    } catch {
      throw new RemoteHostError(
        this.machine.id,
        "auth",
        uncertain
          ? "Access changed while waiting for this computer. Restore access and check the result before retrying."
          : "Unlock the app before connecting to this computer.",
        uncertain,
      );
    }
  }

  /** Recheck the existing read guard while cooperative response decoding yields. */
  assertCurrentAccess(): void {
    this.requireAccess();
  }
  private assertTargetAvailable(params: Record<string, unknown>, uncertain = false): void {
    if (
      this.targetScopeInvalidated ||
      this.removedTargets.has("environment") ||
      (typeof params.sessionId === "string" &&
        this.removedTargets.has(`session:${params.sessionId}`)) ||
      (typeof params.projectId === "string" &&
        this.removedTargets.has(`project:${params.projectId}`))
    )
      throw new RemoteHostError(
        this.machine.id,
        "identity",
        "This session or project was removed. Reopen its current view.",
        uncertain,
      );
  }
  private removeTarget(target: MobileStreamTarget): void {
    const key =
      target.kind === "session"
        ? `session:${target.sessionId}`
        : target.kind === "project"
          ? `project:${target.projectId}`
          : "environment";
    if (this.removedTargets.size >= 64 && !this.removedTargets.has(key))
      this.targetScopeInvalidated = true;
    else this.removedTargets.add(key);
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: RemoteRequestOptions = {},
  ): Promise<T> {
    const started = Date.now();
    try {
      return await this.dispatchRequest<T>(method, params, options);
    } catch (error) {
      // Method name, error kind and duration only; never parameters or bodies.
      if (!(error instanceof RemoteHostError && error.kind === "aborted"))
        logDiagnostic("warn", "mobile.rpc", "host request failed", {
          method,
          error: error instanceof RemoteHostError ? error.kind : error instanceof Error ? error.name : "unknown",
          ms: Date.now() - started,
        });
      throw error;
    }
  }

  private async dispatchRequest<T>(
    method: string,
    params: Record<string, unknown>,
    options: RemoteRequestOptions,
  ): Promise<T> {
    if (method === "commands.dispatch" || method === "crews.respond")
      assertApprovalCommand(
        this.machine.capabilities,
        method === "crews.respond" ? { ...params, type: "approve" } : params,
      );
    if (nativeDesktopMethod(method))
      throw new RemoteHostError(
        this.machine.id,
        "unsupported",
        "Native desktop operations require the desktop's private Host bridge.",
      );
    this.assertTargetAvailable(params);
    if (options.signal?.aborted)
      throw new RemoteHostError(this.machine.id, "aborted", "Request cancelled.");
    if (method !== "environment.describe" && !this.machine.environmentId)
      throw new RemoteHostError(
        this.machine.id,
        "identity",
        "Connect this computer before sending requests.",
      );
    if (sessionExecutionMethod(method))
      return requestSessionExecution<T>(
        this.machine,
        (rawMethod, rawParams = {}, rawOptions = {}) =>
          this.requestAuthenticated(rawMethod, rawParams, rawOptions),
        method,
        params,
        options,
      );
    return this.requestAuthenticated<T>(method, params, options);
  }

  private async requestAuthenticated<T>(
    method: string,
    params: Record<string, unknown>,
    options: RemoteRequestOptions,
  ): Promise<T> {
    this.assertTargetAvailable(params);
    // The cohort is selected before dispatch. A WSS failure never resubmits
    // that request over HTTP. Unmigrated domain methods retain explicit HTTP.
    const wireMethod = hostRpcWireMethod(method);
    if (
      process.env.EXPO_OS !== "web" &&
      method !== "environment.describe" &&
      mobileWsMethodEnabled(this.machine.capabilities ?? [], wireMethod)
    ) {
      // Legacy owners accept some retained variants and larger CAS file bodies.
      // Select their original HTTP request before native acquisition or WS send.
      const parsed = getHostRpcMethod(wireMethod)?.paramsSchema.safeParse(params);
      // Protocol identifiers are at most 200 ASCII characters; reserve that full RPC ID.
      if (
        parsed?.success &&
        utf8Bytes(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "x".repeat(200),
            method: wireMethod,
            params: parsed.data,
          }),
        ) <= WS_LIMITS.maxMessageBytes
      )
        return this.requestWs<T>(wireMethod, params, options, method);
    }
    return this.requestHttp<T>(method, params, options);
  }
  private async requestHttp<T>(
    method: string,
    params: Record<string, unknown>,
    options: RemoteRequestOptions,
  ): Promise<T> {
    const read = readonlyRequest(method, params) && !deviceHttpEffect(method);
    const waiting =
      ["sessions.sync", "machine.changes"].includes(method) && typeof params.waitMs === "number"
        ? Math.max(0, params.waitMs) + 5_000
        : 0;
    const requestedTimeout = options.timeoutMs ?? Math.max(DEFAULT_TIMEOUT_MS, waiting);
    const timeout = Number.isFinite(requestedTimeout)
      ? Math.min(180_000, Math.max(1_000, requestedTimeout))
      : DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;
    const attempts = read && options.retry !== false ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        this.requireAccess();
        const result = await this.perform<T>(method, params, read, options, deadline);
        this.requireAccess(!read);
        this.assertTargetAvailable(params, !read);
        if (method === "environment.describe") {
          let descriptor: HostDescriptor;
          try {
            descriptor = requireMobileHostDescriptor(result);
          } catch (error) {
            throw new RemoteHostError(
              this.machine.id,
              "protocol",
              error instanceof Error ? error.message : "Invalid host description.",
            );
          }
          if (this.machine.environmentId && descriptor.environmentId !== this.machine.environmentId)
            throw new RemoteHostError(
              this.machine.id,
              "identity",
              "This address now belongs to a different computer. Pair it again explicitly.",
            );
          if (this.machine.environmentId)
            getHostWsRuntimeProvider()?.remember(this.machine, descriptor);
        }
        return result;
      } catch (error) {
        if (
          !(error instanceof RemoteHostError) ||
          attempt + 1 >= attempts ||
          !["network", "timeout"].includes(error.kind) ||
          options.signal?.aborted ||
          Date.now() >= deadline
        )
          throw error;
      }
    }
    throw new RemoteHostError(this.machine.id, "network", "This computer did not answer.");
  }

  /** Warm one native lease while the view mounts; legacy cohorts do no work. */
  async prepare(): Promise<void> {
    if (process.env.EXPO_OS === "web") return;
    if (selectMobileHostTransport(this.machine.capabilities ?? [], true) === "legacy-http") return;
    const consumer = await this.acquireWs();
    await this.waitReady(consumer, {});
  }
  connectionState(): string {
    if (this.disposed) return "closed";
    if (process.env.EXPO_OS === "web") return "legacy-http";
    if (selectMobileHostTransport(this.machine.capabilities ?? [], true) === "legacy-http")
      return "legacy-http";
    return this.wsConsumer?.state() ?? (this.wsPreparing ? "connecting" : "idle");
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const stream of this.streams) stream.close();
    this.streams.clear();
    for (const controller of this.wsActive) controller.abort();
    this.wsActive.clear();
    this.wsConsumer?.release();
    this.wsConsumer = undefined;
  }
  supportsStreams(): boolean {
    return (
      process.env.EXPO_OS !== "web" &&
      !!this.machine.capabilities?.includes("transport.ws.streams.v2") &&
      mobileWsMethodEnabled(this.machine.capabilities, "subscriptions.open") &&
      (this.wsConsumer?.state() !== "ready" ||
        ["subscriptions.open", "subscriptions.ack", "subscriptions.close"].every((method) =>
          this.wsConsumer!.supports(method),
        ))
    );
  }
  /**
   * `onPhase` reports whether the view still waits for a fresh baseline ("catching-up":
   * opening, reconnecting or after a resync) or holds the Host's latest ("live": an event
   * was just applied). It never reports data the phone has not committed.
   */
  async observeStream(
    target: MobileStreamTarget,
    apply: MobileStreamApply,
    onError: (error: Error) => void = () => undefined,
    onPhase: (phase: MobileStreamPhase) => void = () => undefined,
  ): Promise<MobileStreamSubscription> {
    this.requireAccess();
    this.assertTargetAvailable(target.kind === "environment" ? {} : target);
    if (!this.supportsStreams())
      throw new RemoteHostError(
        this.machine.id,
        "unsupported",
        "This computer has not enabled native live streams.",
      );
    if (this.streams.size + this.streamReservations >= 64)
      throw new RemoteHostError(this.machine.id, "network", "Too many mounted Host streams.");
    this.streamReservations++;
    let consumer: HostWsConsumer;
    try {
      consumer = await this.acquireWs();
    } finally {
      this.streamReservations--;
    }
    this.requireAccess();
    let subscriptionId = `mobile:${this.machine.id}:${++streamIdSequence}`;
    let closed = false,
      fence = 0,
      streamId: string | undefined,
      cursor: StreamCursor | undefined;
    let opening: Promise<void> | undefined;
    let detachState: () => void = () => undefined;
    let detachEvents: () => void = () => undefined;
    let detachReprobe: () => void = () => undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const assertCurrent = (expected: number) => {
      this.requireAccess();
      if (closed || fence !== expected || consumer.state() !== "ready")
        throw new HostWsError("cancelled");
    };
    const open = () => {
      if (closed || consumer.state() !== "ready" || opening) return;
      if (
        !["subscriptions.open", "subscriptions.ack", "subscriptions.close"].every((method) =>
          consumer.supports(method),
        )
      ) {
        onError(
          new RemoteHostError(
            this.machine.id,
            "unsupported",
            "This Host has not negotiated the live stream controls.",
          ),
        );
        subscription.close();
        return;
      }
      const expected = fence;
      const openingId = subscriptionId;
      onPhase("catching-up");
      const pending = Promise.resolve()
        .then(() =>
          consumer.request("subscriptions.open", {
            subscriptionId: openingId,
            target,
            ...(cursor ? { cursor } : {}),
          }),
        )
        .then((result) => {
          assertCurrent(expected);
          const opened = SubscriptionOpenResultSchema.parse(result);
          if (opened.subscriptionId !== openingId) throw new HostWsError("identity");
          streamId = opened.streamId;
        });
      opening = pending;
      void pending
        .catch((error) => {
          if (closed || fence !== expected) return;
          onError(error instanceof Error ? error : new HostWsError("schema"));
          if (terminalStreamError(error)) return;
          scheduleRetry();
        })
        .finally(() => {
          if (opening === pending) opening = undefined;
        });
    };
    const restart = () => {
      const previousId = subscriptionId;
      onPhase("catching-up");
      subscriptionId = `mobile:${this.machine.id}:${++streamIdSequence}`;
      cursor = undefined;
      streamId = undefined;
      fence++;
      const expected = fence;
      void consumer
        .request("subscriptions.close", { subscriptionId: previousId })
        .then(() => {
          if (!closed && fence === expected) {
            opening = undefined;
            open();
          }
        })
        .catch((error) => {
          if (closed || fence !== expected) return;
          onError(error instanceof Error ? error : new HostWsError("network"));
          if (terminalStreamError(error)) subscription.close();
          else scheduleRetry();
        });
    };
    // A failed open/apply re-subscribes with exponential backoff and full jitter
    // (cap 30s) instead of closing the stream for good. `attempt` resets once an
    // event applies. Reprobe skips the wait on foreground and network regain.
    const scheduleRetry = () => {
      if (closed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!closed && consumer.state() === "ready") restart();
      }, backoffDelayMs(attempt++));
    };
    const reprobe = () => {
      if (closed || consumer.state() !== "ready" || streamId !== undefined || opening) return;
      clearTimeout(retryTimer);
      retryTimer = undefined;
      attempt = 0;
      restart();
    };
    const subscription: MobileStreamSubscription = {
      close: () => {
        if (closed) return;
        closed = true;
        fence++;
        clearTimeout(retryTimer);
        retryTimer = undefined;
        detachReprobe();
        detachEvents();
        detachState();
        this.streams.delete(subscription);
        if (consumer.state() === "ready")
          void Promise.resolve()
            .then(() => consumer.request("subscriptions.close", { subscriptionId }))
            .catch(() => undefined);
      },
    };
    this.streams.add(subscription);
    try {
      detachEvents = consumer.subscribe(async (event, assertDeliveryCurrent) => {
        if (closed || event.params.subscriptionId !== subscriptionId) return false;
        if (["closed", "resync-required"].includes(event.params.kind)) {
          const accept = () => {
            this.requireAccess();
            assertDeliveryCurrent();
            if (
              closed ||
              event.params.subscriptionId !== subscriptionId ||
              event.params.streamId !== streamId
            )
              return false;
            if (event.params.kind === "resync-required") {
              // Discard the old cursor/commit guard now, without awaiting data I/O.
              restart();
              return false;
            }
            // Terminal deletion/revocation dominates an in-flight callback.
            // Release application guards and cursor before calling observers.
            this.removeTarget(target);
            cursor = undefined;
            subscription.close();
            void Promise.resolve()
              .then(() =>
                onError(
                  new RemoteHostError(
                    this.machine.id,
                    "identity",
                    "This session or project was removed. Reopen its current view.",
                  ),
                ),
              )
              .catch(() => undefined);
            return true;
          };
          if (streamId !== undefined) return accept();
          try {
            await opening;
            return accept();
          } catch {
            return false;
          }
        }
        const expected = fence;
        const assertEventCurrent = () => {
          assertDeliveryCurrent();
          assertCurrent(expected);
        };
        try {
          // Initial events may precede their open reply. Keep them uncommitted
          // until the server's stream identity has been confirmed.
          if (opening) await opening;
          assertEventCurrent();
          if (event.params.streamId !== streamId) throw new HostWsError("identity");
          if (
            cursor?.epoch === event.params.cursor.epoch &&
            event.params.cursor.sequence <= cursor.sequence
          )
            return true;
          if (
            event.params.kind === "delta" &&
            cursor &&
            (event.params.cursor.epoch !== cursor.epoch ||
              event.params.cursor.sequence !== cursor.sequence + 1)
          ) {
            restart();
            return false;
          }
          const applied = await apply(event, assertEventCurrent);
          assertEventCurrent();
          if (applied === "resync") {
            restart();
            return false;
          }
          if (applied) {
            cursor = event.params.cursor;
            attempt = 0;
            onPhase("live");
          }
          return applied;
        } catch (error) {
          if (!closed && fence === expected) {
            onError(error instanceof Error ? error : new HostWsError("schema"));
            if (terminalStreamError(error)) subscription.close();
            else {
              // Re-subscribe from a fresh snapshot rather than leaving the view stale.
              cursor = undefined;
              scheduleRetry();
            }
          }
          return false;
        }
      });
      detachState = consumer.onState((state) => {
        if (closed) return;
        if (state !== "ready") {
          fence++;
          streamId = undefined;
          opening = undefined;
          onPhase("catching-up");
        }
        if (["blocked", "backoff", "suspended", "closed"].includes(state))
          onError(
            new RemoteHostError(
              this.machine.id,
              state === "blocked" ? "auth" : "network",
              "The live Host stream is disconnected. Cached data may be out of date.",
            ),
          );
        if (state === "ready") {
          clearTimeout(retryTimer);
          retryTimer = undefined;
          open();
        }
      });
      const detachFocus = focusManager.subscribe((focused) => focused && reprobe());
      const detachOnline = onlineManager.subscribe((online) => online && reprobe());
      detachReprobe = () => {
        detachFocus();
        detachOnline();
      };
      open();
      return subscription;
    } catch (error) {
      subscription.close();
      throw error;
    }
  }
  private async acquireWs(): Promise<HostWsConsumer> {
    this.requireAccess();
    if (this.wsConsumer?.state() === "closed") {
      this.wsConsumer.release();
      this.wsConsumer = undefined;
      this.wsPreparing = undefined;
    }
    if (this.wsConsumer) return this.wsConsumer;
    if (!this.wsPreparing) {
      const provider = getHostWsRuntimeProvider();
      if (!provider)
        throw new RemoteHostError(
          this.machine.id,
          "unsupported",
          "The native Host connection is not available yet.",
        );
      const promise = provider
        .acquire(
          this.machine,
          async () => {
            // This finite bootstrap exception uses the existing guarded encrypted
            // LAN/HTTPS read. Normal WSS and protected bulk never read a JS bearer.
            const raw = await this.perform<unknown>(
              "environment.describe",
              { supportedProviders: [...REMOTE_PROVIDERS] },
              true,
              { retry: false },
              Date.now() + DEFAULT_TIMEOUT_MS,
            );
            this.requireAccess();
            const descriptor = requireMobileHostDescriptor(raw);
            if (descriptor.environmentId !== this.machine.environmentId)
              throw new RemoteHostError(
                this.machine.id,
                "identity",
                "Host identity changed. Pair this computer again.",
              );
            return descriptor;
          },
          () => this.requireAccess(),
        )
        .then((consumer) => {
          if (this.disposed) {
            consumer.release();
            throw new RemoteHostError(this.machine.id, "aborted", "This computer view was closed.");
          }
          this.requireAccess();
          this.wsConsumer = consumer;
          return consumer;
        });
      this.wsPreparing = promise;
      void promise.catch(() => {
        if (this.wsPreparing === promise) this.wsPreparing = undefined;
      });
    }
    return this.wsPreparing;
  }
  private waitReady(consumer: HostWsConsumer, options: RemoteRequestOptions): Promise<void> {
    const state = consumer.state();
    if (state === "ready") return Promise.resolve();
    if (options.signal?.aborted) return Promise.reject(new HostWsError("cancelled"));
    if (state !== "connecting" && state !== "idle")
      return Promise.reject(new HostWsError(state === "blocked" ? "authentication" : "network"));
    return new Promise((resolve, reject) => {
      let unsubscribe: () => void = () => undefined;
      const finish = (error?: HostWsError) => {
        clearTimeout(timer);
        unsubscribe();
        options.signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new HostWsError("cancelled"));
      const timer = setTimeout(
        () => finish(new HostWsError("deadline")),
        Math.min(DEFAULT_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      );
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        unsubscribe = consumer.onState((next) => {
          if (next === "ready") finish();
          else if (["blocked", "backoff", "suspended", "closed"].includes(next))
            finish(new HostWsError(next === "blocked" ? "authentication" : "network"));
        });
      } catch {
        finish(new HostWsError("overload"));
      }
      if (consumer.state() === "ready") finish();
    });
  }
  private async requestWs<T>(
    method: string,
    params: Record<string, unknown>,
    options: RemoteRequestOptions,
    legacyMethod = method,
  ): Promise<T> {
    const controller = new AbortController();
    this.wsActive.add(controller);
    const requested = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = Number.isFinite(requested)
      ? Math.max(1_000, Math.min(180_000, requested))
      : DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      this.requireAccess();
      const definition = getHostRpcMethod(method);
      if (!definition)
        throw new RemoteHostError(
          this.machine.id,
          "unsupported",
          "This Host operation has not migrated to the native socket contract.",
        );
      const consumer = await new Promise<HostWsConsumer>((resolve, reject) => {
        const cancel = () => reject(new HostWsError(timedOut ? "deadline" : "cancelled"));
        controller.signal.addEventListener("abort", cancel, { once: true });
        if (controller.signal.aborted) {
          cancel();
          return;
        }
        void this.acquireWs()
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener("abort", cancel));
      });
      this.requireAccess();
      if (controller.signal.aborted) throw new HostWsError(timedOut ? "deadline" : "cancelled");
      // Safe queries may await the initial handshake. Mutations remain unsent
      // when connecting; there is no hidden reconnect command outbox.
      if (definition.retry === "safe-query")
        await this.waitReady(consumer, {
          timeoutMs: Math.max(1, deadline - Date.now()),
          signal: controller.signal,
        });
      if (controller.signal.aborted) throw new HostWsError(timedOut ? "deadline" : "cancelled");
      // A capability is only a preflight hint; hello.methods is the routed
      // allowlist. Compatibility is selected before this RPC has been sent.
      if (consumer.state() === "ready" && !consumer.supports(method))
        return await this.requestHttp<T>(legacyMethod, params, {
          ...options,
          timeoutMs: Math.max(1, deadline - Date.now()),
          signal: controller.signal,
        });
      const result = await consumer.request<T>(method, params, {
        timeoutMs: Math.max(1, deadline - Date.now()),
        signal: controller.signal,
      });
      this.requireAccess(definition.retry !== "safe-query");
      this.assertTargetAvailable(params, definition.retry !== "safe-query");
      if (method === "environment.describe") requireMobileHostDescriptor(result);
      return result;
    } catch (error) {
      if (error instanceof RemoteHostError) throw error;
      if (error instanceof HostWsError) {
        const kind: RemoteErrorKind = timedOut
          ? "timeout"
          : error.category === "authentication" || error.category === "tls"
            ? "auth"
            : error.category === "identity"
              ? "identity"
              : error.category === "schema"
                ? "protocol"
                : error.category === "deadline"
                  ? "timeout"
                  : error.category === "cancelled"
                    ? "aborted"
                    : error.category === "unsupported"
                      ? "unsupported"
                      : ["internal", "unavailable", "overload", "validation"].includes(
                            error.category,
                          )
                        ? "host"
                        : "network";
        const failure = new RemoteHostError(this.machine.id, kind, error.message, error.uncertain);
        // A busy or not-yet-ready Host answers again shortly; reads retry quietly.
        if (error.category === "overload" || error.category === "unavailable")
          Object.assign(failure, { transient: true });
        throw failure;
      }
      throw new RemoteHostError(
        this.machine.id,
        "protocol",
        "The native Host connection returned an invalid result.",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      this.wsActive.delete(controller);
    }
  }

  private async perform<T>(
    method: string,
    params: Record<string, unknown>,
    read: boolean,
    options: RemoteRequestOptions,
    deadline: number,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    let started = false;
    let credential: string | null = null;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(0, deadline - Date.now()),
    );
    try {
      if (controller.signal.aborted)
        throw new RemoteHostError(this.machine.id, "aborted", "Request cancelled.");
      // SecureStore is part of the request deadline, even if its native promise stalls.
      credential = await new Promise<string | null>((resolve, reject) => {
        const cancel = () => {
          controller.signal.removeEventListener("abort", cancel);
          reject(new Error("Request cancelled."));
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        Promise.resolve()
          .then(() => this.readCredential())
          .then(resolve, () =>
            reject(
              new RemoteHostError(
                this.machine.id,
                "auth",
                "The saved device credential could not be read. Unlock the app or pair this computer again.",
              ),
            ),
          )
          .finally(() => controller.signal.removeEventListener("abort", cancel));
      });
      if (controller.signal.aborted) throw new Error("Request cancelled.");
      this.requireAccess();
      if (!credential || !/^[A-Za-z0-9_-]{43}$/.test(credential))
        throw new RemoteHostError(
          this.machine.id,
          "auth",
          "Pair this computer with a valid bycoda device credential.",
        );
      const payload = JSON.stringify({
        version: HOST_PROTOCOL_VERSION,
        environmentId: this.machine.environmentId || undefined,
        method,
        params,
      });
      if (utf8Bytes(payload) > MAX_RESPONSE_BYTES)
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
          "This request exceeds the host transfer limit.",
        );
      started = true;
      const fetcher = this.machine.lanKey
        ? encryptedLanFetch(
            this.fetchImpl,
            this.machine.environmentId,
            this.machine.lanKey,
            undefined,
            () => this.requireAccess(),
          )
        : this.fetchImpl;
      const response = await fetcher(`${this.endpoint}/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: payload,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      const unauthorized = response.status === 401;
      const authMessage = "This device credential is invalid or revoked. Pair the computer again.";
      let raw: string;
      try {
        raw = await boundedResponseText(response, MAX_RESPONSE_BYTES, () => {
          controller.abort();
          return new RemoteHostError(
            this.machine.id,
            unauthorized ? "auth" : "protocol",
            unauthorized ? authMessage : "The host response exceeds the transfer limit.",
            !read,
          );
        });
      } catch (error) {
        this.requireAccess(!read);
        if (unauthorized && !timedOut && !options.signal?.aborted)
          throw new RemoteHostError(this.machine.id, "auth", authMessage, !read);
        throw error;
      }
      this.requireAccess(!read);
      this.assertTargetAvailable(params, !read);
      // A proxy may return HTML while the host restarts. Only these explicit
      // transient HTTP statuses qualify for the existing bounded read retry;
      // a malformed successful response remains a protocol failure.
      const invalidKind = unauthorized
        ? "auth"
        : [502, 503, 504].includes(response.status)
          ? "network"
          : "protocol";
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new RemoteHostError(
          this.machine.id,
          invalidKind,
          unauthorized
            ? authMessage
            : invalidKind === "network"
              ? `The computer is temporarily unavailable (HTTP ${response.status}).`
              : "The computer returned an invalid host response.",
          !read,
        );
      }
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RemoteHostError(
          this.machine.id,
          invalidKind,
          unauthorized
            ? authMessage
            : invalidKind === "network"
              ? `The computer is temporarily unavailable (HTTP ${response.status}).`
              : "The computer returned an invalid host response.",
          !read,
        );
      const envelope = value as Record<string, unknown>;
      const admittedUnknown =
        deviceHttpEffect(method) &&
        envelope.code === "HOST_DEVICE_OPERATION_UNCONFIRMED" &&
        envelope.delivery === "unknown";
      const unknownMessage =
        "The device operation may have completed; its outcome is unknown. Do not repeat this request; inspect the original device or preview status.";
      if (unauthorized) {
        const uncertain = admittedUnknown || (!read && typeof envelope.error !== "string");
        throw new RemoteHostError(
          this.machine.id,
          "auth",
          uncertain && deviceHttpEffect(method) ? `${authMessage} ${unknownMessage}` : authMessage,
          uncertain,
        );
      }
      if (typeof envelope.error === "string") {
        const message = safeHostMessage(envelope.error, credential);
        const kind: RemoteErrorKind = /identity changed/i.test(message)
          ? "identity"
          : /Unsupported host method|incompatible protocol/i.test(message)
            ? "unsupported"
            : "host";
        throw new RemoteHostError(
          this.machine.id,
          kind,
          admittedUnknown ? `${message} ${unknownMessage}` : message,
          admittedUnknown || (!read && response.status >= 500),
        );
      }
      if (admittedUnknown) throw new RemoteHostError(this.machine.id, "host", unknownMessage, true);
      if (!response.ok || !Object.prototype.hasOwnProperty.call(envelope, "result"))
        throw new RemoteHostError(
          this.machine.id,
          invalidKind,
          `The computer returned an unexpected response (HTTP ${response.status}).`,
          !read,
        );
      return envelope.result as T;
    } catch (error) {
      if (error instanceof RemoteHostError) throw error;
      if (options.signal?.aborted)
        throw new RemoteHostError(
          this.machine.id,
          "aborted",
          "Request cancelled.",
          started && !read,
        );
      if (timedOut)
        throw new RemoteHostError(
          this.machine.id,
          "timeout",
          "This computer took too long to answer. Refresh to confirm the result.",
          started && !read,
        );
      throw new RemoteHostError(
        this.machine.id,
        "network",
        "This computer could not be reached. Check its connection and try again.",
        started && !read,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
