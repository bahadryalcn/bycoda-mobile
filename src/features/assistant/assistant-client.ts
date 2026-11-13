import {
  AssistantRequestValidationSchema,
  AssistantResponseValidationSchema,
  type AssistantMessage,
  type AssistantResponse,
  type AssistantSnapshot,
  type AssistantProfilePatch,
  type AssistantProfile,
  type AssistantNotificationTarget,
} from "../../../../src/shared/model/host-contracts/assistant";
import type {
  AssistantOwnerQuestion,
  AssistantOwnerQuestionReceipt,
} from "../../../../src/shared/model/assistantOwnerQuestions";
import { RemoteHostError } from "@/remote/host-error";

export type OwnerPresence = "present" | "away" | "dnd";
/** The exact identity of one Room message; its key is never replaced once the Host may have seen it. */
export type AssistantSendIntent = {
  threadId: string;
  text: string;
  key: string;
  hostInstance: string;
  sessionId?: string;
};
export type AssistantJobAction = "pause" | "resume" | "stop";
export type AssistantQuestionIntent =
  | {
      op: "questions.answer";
      id: string;
      expectedVersion: number;
      requestId: string;
      answers: Record<string, string[]>;
      custom?: Record<string, string>;
      notes?: Record<string, string>;
    }
  | {
      op: "questions.snooze";
      id: string;
      expectedVersion: number;
      requestId: string;
      until: number;
    };
export type AssistantMobileRequest =
  | { op: "snapshot"; limit: number }
  | { op: "threads.open"; projectId?: string }
  | { op: "threads.messages"; threadId: string; limit: number; before?: number; beforeId?: string }
  | { op: "presence.set"; state: OwnerPresence }
  | { op: "pauseAll" }
  | { op: "notifications.targets" }
  | { op: "profile.update"; expectedVersion: number; patch: AssistantProfilePatch }
  | { op: "threads.sendIdentity" }
  | {
      op: "threads.send";
      via: "text";
      threadId: string;
      text: string;
      sessionId?: string;
      idempotencyKey: string;
      expectedHostInstance: string;
    }
  | {
      op: "threads.sendStatus";
      threadId: string;
      text: string;
      sessionId?: string;
      idempotencyKey: string;
      expectedHostInstance: string;
    }
  | { op: "jobs.control"; id: string; expectedVersion: number; action: AssistantJobAction }
  | { op: "questions.get"; id: string; requestId?: string }
  | AssistantQuestionIntent;
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

/**
 * A write failed after it may have reached the Host. The owner must check its receipt;
 * this client never dispatches the same identity again on its own.
 */
export class AssistantDispatchError extends Error {
  constructor(readonly reason: unknown) {
    super(reason instanceof Error ? reason.message : "The result is unknown.");
    this.name = "AssistantDispatchError";
  }
}
export type AssistantSendReceipt = "settled" | "unknown" | "refused" | "notSent";
/** Structural equality that ignores object key order, which a parsed Host record may not preserve. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const semanticQuestion = (question: AssistantOwnerQuestion) => ({
  id: question.id,
  jobId: question.jobId,
  projectIds: question.projectIds,
  sourceToken: question.sourceToken,
  origin: question.origin,
  threadId: question.threadId,
  ownerMessageId: question.ownerMessageId,
  prompt: question.prompt,
});
const sendWire = (intent: AssistantSendIntent) => ({
  threadId: intent.threadId,
  text: intent.text,
  ...(intent.sessionId ? { sessionId: intent.sessionId } : {}),
  idempotencyKey: intent.key,
  expectedHostInstance: intent.hostInstance,
});
const receiptMatches = (
  receipt: AssistantOwnerQuestionReceipt | undefined,
  intent: AssistantQuestionIntent,
) =>
  !!receipt &&
  receipt.requestId === intent.requestId &&
  receipt.kind === (intent.op === "questions.answer" ? "answer" : "snooze") &&
  receipt.version === intent.expectedVersion + 1 &&
  sameJson(receipt.input, intent);

/**
 * Captures a paired connection epoch. Writes are the finite set below: presence, Room messages,
 * job pause/resume/stop and owner-question answers. Each checks the epoch before and after dispatch.
 */
export class AssistantMobileClient {
  private presenceAttempt?: { state: OwnerPresence; status: "sending" | "unknown" };
  constructor(private readonly port: AssistantMobilePort) {
    this.port = Object.freeze({ ...port });
  }
  private check() {
    if (!this.port.environmentId || !this.port.current()) throw new AssistantMobileError("source");
  }
  async read(
    input: Extract<
      AssistantMobileRequest,
      { op: "snapshot" | "threads.open" | "threads.messages" }
    >,
    signal?: AbortSignal,
  ): Promise<AssistantResponse> {
    if (!["snapshot", "threads.open", "threads.messages"].includes(input?.op))
      throw new AssistantMobileError("unsupported");
    return this.call(input, signal);
  }
  get pendingPresence() {
    return this.presenceAttempt;
  }
  /** Stops Room work after explicit owner confirmation; transport never retries writes. */
  async pauseAll(): Promise<void> {
    const response = await this.call({ op: "pauseAll" });
    if (response.ok !== true) throw new AssistantMobileError("response");
  }
  /** Owner-readable, sanitized destinations from this captured Host only. */
  async notificationTargets(): Promise<AssistantNotificationTarget[]> {
    const response = await this.call({ op: "notifications.targets" });
    if (!response.notificationTargets) throw new AssistantMobileError("response");
    return response.notificationTargets;
  }
  /** Profile mirror only. This never grants native standing authority. */
  async updateProfile(
    expectedVersion: number,
    patch: AssistantProfilePatch,
  ): Promise<AssistantProfile> {
    const response = await this.call({ op: "profile.update", expectedVersion, patch });
    if (!response.profile || response.profile.version !== expectedVersion + 1)
      throw new AssistantMobileError("response");
    return response.profile;
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
  /** Host instance that owns the receipt of a send; read before the message is recorded. */
  async sendIdentity(): Promise<string> {
    const response = await this.call({ op: "threads.sendIdentity" });
    if (!response.sendIdentity?.instanceId) throw new AssistantMobileError("response");
    return response.sendIdentity.instanceId;
  }
  /** Failures before dispatch propagate unchanged; afterwards they become AssistantDispatchError. */
  async send(intent: AssistantSendIntent): Promise<AssistantMessage[]> {
    let dispatched = false;
    try {
      const response = await this.call(
        { op: "threads.send", via: "text", ...sendWire(intent) },
        undefined,
        () => {
          dispatched = true;
        },
      );
      if (!response.messages?.some((message) => message.role === "assistant"))
        throw new AssistantMobileError("uncertain");
      return response.messages;
    } catch (error) {
      throw dispatched ? new AssistantDispatchError(error) : error;
    }
  }
  /** Reads the receipt of an earlier send. Absence never permits another send. */
  async sendStatus(
    intent: AssistantSendIntent,
  ): Promise<{ status: AssistantSendReceipt; messages: AssistantMessage[] }> {
    const response = await this.call({ op: "threads.sendStatus", ...sendWire(intent) });
    if (!response.sendReceipt) throw new AssistantMobileError("response");
    return { status: response.sendReceipt.status, messages: response.messages ?? [] };
  }
  /** The expected version makes a repeat of a lost control conflict instead of acting twice. */
  async controlJob(input: {
    id: string;
    expectedVersion: number;
    action: AssistantJobAction;
  }): Promise<void> {
    if (!["pause", "resume", "stop"].includes(input?.action))
      throw new AssistantMobileError("unsupported");
    const response = await this.call({
      op: "jobs.control",
      id: input.id,
      expectedVersion: input.expectedVersion,
      action: input.action,
    });
    if (!response.job || response.job.id !== input.id) throw new AssistantMobileError("response");
  }
  /**
   * Delivers one saved owner-question intent. The Host receipt is read first, so a lost
   * acknowledgement resolves without dispatching the same request ID a second time.
   */
  async deliverQuestion(
    question: AssistantOwnerQuestion,
    intent: AssistantQuestionIntent,
  ): Promise<AssistantOwnerQuestion> {
    if (!["questions.answer", "questions.snooze"].includes(intent?.op))
      throw new AssistantMobileError("unsupported");
    if (intent.id !== question.id) throw new AssistantMobileError("source");
    const accepted = (response: AssistantResponse) =>
      response.ownerQuestion &&
      sameJson(semanticQuestion(response.ownerQuestion), semanticQuestion(question)) &&
      receiptMatches(
        response.ownerQuestionReceipt ?? response.ownerQuestion.lastOwnerAction,
        intent,
      )
        ? response.ownerQuestion
        : undefined;
    const response = await this.call({
      op: "questions.get",
      id: intent.id,
      requestId: intent.requestId,
    });
    const done = accepted(response);
    if (done) return done;
    const inspected = response.ownerQuestion;
    if (
      !inspected ||
      inspected.version !== intent.expectedVersion ||
      !sameJson(semanticQuestion(inspected), semanticQuestion(question)) ||
      inspected.sourceCurrent === false ||
      !["open", "snoozed"].includes(inspected.status)
    )
      throw new AssistantMobileError("source");
    const complete = accepted(await this.call(structuredClone(intent)));
    if (!complete) throw new AssistantMobileError("uncertain");
    return complete;
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
    if (
      (parsed.op === "threads.send" || parsed.op === "threads.sendStatus") &&
      response.data.messages?.some((message) => message.threadId !== parsed.threadId)
    )
      throw new AssistantMobileError("response");
    return response.data;
  }
}
