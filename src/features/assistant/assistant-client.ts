import {
  AssistantRequestValidationSchema,
  AssistantResponseValidationSchema,
  type AssistantResponse,
  type AssistantSnapshot,
} from "../../../../src/shared/model/host-contracts/assistant";
import { RemoteHostError } from "@/remote/host-error";

export type OwnerPresence = "present" | "away" | "dnd";
export type AssistantMobileRequest =
  | { op: "snapshot"; limit: number }
  | { op: "threads.open"; projectId?: string }
  | { op: "threads.messages"; threadId: string; limit: number; before?: number; beforeId?: string }
  | { op: "presence.set"; state: OwnerPresence };
export type AssistantMobilePort = {
  environmentId: string;
  current(): boolean;
  request(
    method: string,
    params: Record<string, unknown>,
    options: { retry: false; signal?: AbortSignal },
  ): Promise<unknown>;
};

export class AssistantMobileError extends RemoteHostError {
  constructor(readonly code: "source" | "unsupported" | "response" | "uncertain") {
    super(
      "",
      code === "source" ? "identity" : code === "unsupported" ? "unsupported" : "protocol",
      code === "source"
        ? "The computer connection changed."
        : code === "unsupported"
          ? "Assistant support is unavailable."
          : "Could not complete this action.",
      code === "uncertain",
    );
  }
}

/** Captures a paired connection epoch. This client exposes no arbitrary assistant writes. */
export class AssistantMobileClient {
  private presenceAttempt?: { state: OwnerPresence; status: "sending" | "unknown" };
  constructor(private readonly port: AssistantMobilePort) {
    this.port = Object.freeze({ ...port });
  }
  private check() {
    if (!this.port.environmentId || !this.port.current()) throw new AssistantMobileError("source");
  }
  async read(
    input: Exclude<AssistantMobileRequest, { op: "presence.set" }>,
    signal?: AbortSignal,
  ): Promise<AssistantResponse> {
    if (!["snapshot", "threads.open", "threads.messages"].includes(input?.op))
      throw new AssistantMobileError("unsupported");
    return this.call(input, signal);
  }
  get pendingPresence() {
    return this.presenceAttempt;
  }
  async setPresence(state: OwnerPresence): Promise<void> {
    if (!["present", "away", "dnd"].includes(state)) throw new AssistantMobileError("unsupported");
    if (this.presenceAttempt) throw new AssistantMobileError("uncertain");
    this.check();
    const attempt = { state, status: "sending" as "sending" | "unknown" };
    this.presenceAttempt = attempt;
    let dispatched = false;
    try {
      const response = await this.call({ op: "presence.set", state }, undefined, () => {
        dispatched = true;
      });
      if (response.ok !== true) throw new AssistantMobileError("response");
      this.presenceAttempt = undefined;
    } catch (error) {
      if (dispatched) attempt.status = "unknown";
      else this.presenceAttempt = undefined;
      throw error;
    }
  }
  /** Explicit owner review only. Reports current state, never claims an old request was delivered. */
  async inspectPresence(): Promise<AssistantSnapshot> {
    const response = await this.read({ op: "snapshot", limit: 100 });
    if (!response.snapshot) throw new AssistantMobileError("response");
    if (this.presenceAttempt?.status === "unknown") this.presenceAttempt = undefined;
    return response.snapshot;
  }
  private async call(
    input: AssistantMobileRequest,
    signal?: AbortSignal,
    dispatch?: () => void,
  ): Promise<AssistantResponse> {
    this.check();
    const parsed = AssistantRequestValidationSchema.parse(input);
    const descriptor = await this.port.request(
      "environment.describe",
      {},
      { retry: false, signal },
    );
    this.check();
    if (
      !descriptor ||
      typeof descriptor !== "object" ||
      !("environmentId" in descriptor) ||
      descriptor.environmentId !== this.port.environmentId
    )
      throw new AssistantMobileError("source");
    if (
      !("capabilities" in descriptor) ||
      !Array.isArray(descriptor.capabilities) ||
      !descriptor.capabilities.includes("assistant.v1")
    )
      throw new AssistantMobileError("unsupported");
    signal?.throwIfAborted();
    this.check();
    dispatch?.();
    const raw = await this.port.request("assistant.request", parsed, { retry: false, signal });
    this.check();
    const response = AssistantResponseValidationSchema.safeParse(raw);
    if (!response.success) throw new AssistantMobileError("response");
    if (parsed.op === "snapshot" && !response.data.snapshot)
      throw new AssistantMobileError("response");
    if (
      parsed.op === "threads.open" &&
      (!response.data.thread || response.data.thread.projectId !== parsed.projectId)
    )
      throw new AssistantMobileError("response");
    if (
      parsed.op === "threads.messages" &&
      (!response.data.messages ||
        (response.data.thread && response.data.thread.id !== parsed.threadId) ||
        response.data.messages.some((message) => message.threadId !== parsed.threadId))
    )
      throw new AssistantMobileError("response");
    return response.data;
  }
}
