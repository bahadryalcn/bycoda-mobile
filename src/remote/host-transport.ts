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
import { readonlyRequest } from "./request-policy";
import { RemoteHostError } from "./host-error";
import { nativeHostFetch } from "./native-fetch";
import { encryptedLanFetch } from "./lan-fetch";

const DEFAULT_TIMEOUT_MS = 12_000;

export class HostTransport {
  readonly endpoint: string;
  readonly machine: MobileMachine;
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

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: RemoteRequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted)
      throw new RemoteHostError(this.machine.id, "aborted", "Request cancelled.");
    if (method !== "environment.describe" && !this.machine.environmentId)
      throw new RemoteHostError(
        this.machine.id,
        "identity",
        "Connect this computer before sending requests.",
      );
    const read = readonlyRequest(method, params);
    const attempts = read && options.retry !== false ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        this.requireAccess();
        // Re-read on a read retry: lock/revocation/removal can happen after the first attempt.
        let credential: string | null;
        try {
          credential = await this.readCredential();
        } catch {
          throw new RemoteHostError(
            this.machine.id,
            "auth",
            "The saved device credential could not be read. Unlock the app or pair this computer again.",
          );
        }
        this.requireAccess();
        if (!credential || !/^[A-Za-z0-9_-]{43}$/.test(credential))
          throw new RemoteHostError(
            this.machine.id,
            "auth",
            "Pair this computer with a valid bycoda device credential.",
          );
        const result = await this.perform<T>(method, params, credential, read, options);
        this.requireAccess(!read);
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
        }
        return result;
      } catch (error) {
        if (
          !(error instanceof RemoteHostError) ||
          attempt + 1 >= attempts ||
          !["network", "timeout"].includes(error.kind) ||
          options.signal?.aborted
        )
          throw error;
      }
    }
    throw new RemoteHostError(this.machine.id, "network", "This computer did not answer.");
  }

  private async perform<T>(
    method: string,
    params: Record<string, unknown>,
    credential: string,
    read: boolean,
    options: RemoteRequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const waiting =
      ["sessions.sync", "machine.changes"].includes(method) && typeof params.waitMs === "number"
        ? Math.max(0, params.waitMs) + 5_000
        : 0;
    const requestedTimeout = options.timeoutMs ?? Math.max(DEFAULT_TIMEOUT_MS, waiting);
    const timeout = Number.isFinite(requestedTimeout)
      ? Math.min(180_000, Math.max(1_000, requestedTimeout))
      : DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let started = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    try {
      if (controller.signal.aborted)
        throw new RemoteHostError(this.machine.id, "aborted", "Request cancelled.");
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
      if (response.status === 401)
        throw new RemoteHostError(
          this.machine.id,
          "auth",
          "This device credential is invalid or revoked. Pair the computer again.",
        );
      const length = Number(response.headers.get("content-length"));
      if (length > MAX_RESPONSE_BYTES)
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
          "The host response exceeds the transfer limit.",
          !read,
        );
      const raw = await response.text();
      if (utf8Bytes(raw) > MAX_RESPONSE_BYTES)
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
          "The host response exceeds the transfer limit.",
          !read,
        );
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
          "The computer returned an invalid host response.",
          !read,
        );
      }
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
          "The computer returned an invalid host response.",
          !read,
        );
      const envelope = value as Record<string, unknown>;
      if (typeof envelope.error === "string") {
        const message = safeHostMessage(envelope.error, credential);
        const kind: RemoteErrorKind = /identity changed/i.test(message)
          ? "identity"
          : /Unsupported host method|incompatible protocol/i.test(message)
            ? "unsupported"
            : "host";
        throw new RemoteHostError(this.machine.id, kind, message, !read && response.status >= 500);
      }
      if (!response.ok || !Object.prototype.hasOwnProperty.call(envelope, "result"))
        throw new RemoteHostError(
          this.machine.id,
          "protocol",
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
