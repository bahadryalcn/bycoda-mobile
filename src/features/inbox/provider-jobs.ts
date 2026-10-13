import * as Crypto from "expo-crypto";
import type { RemoteInboxReceipt } from "../../../../src/features/inbox/model/remoteInbox";
import { RemoteHostError, type HostTransport } from "@/remote/transport";
import type { InboxJobAction, InboxJobRequest, InboxJobResults } from "./provider-protocol";

export type InboxRpcClient = Pick<HostTransport, "request">;

export class InboxJobError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "InboxJobError";
  }
}

export function isInboxWriteUncertain(error: unknown): boolean {
  return !!error && typeof error === "object" && "uncertain" in error && error.uncertain === true;
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new InboxJobError("Request cancelled."));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new InboxJobError("Request cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function uncertainResult(message: string, error: unknown): InboxJobError {
  return Object.assign(new InboxJobError(message, true), {
    kind: error instanceof RemoteHostError ? error.kind : undefined,
  });
}

/** Keep one durable request ID and poll its receipt. Accepted writes are never replayed. */
export async function runInboxJob<Action extends InboxJobAction>(
  client: InboxRpcClient,
  request: InboxJobRequest<Action>,
  signal?: AbortSignal,
): Promise<InboxJobResults[Action]> {
  const requestId = Crypto.randomUUID();
  const writes = request.action === "comment" || request.action === "pr-action";
  let receipt: RemoteInboxReceipt;
  try {
    receipt = await client.request<RemoteInboxReceipt>(
      "inbox.provider.request",
      { requestId, action: request.action, ...request.input },
      { signal, retry: false },
    );
  } catch (error) {
    if (!(error instanceof RemoteHostError) || !error.uncertain || signal?.aborted) throw error;
    // A lost initial response can follow an accepted desktop job. Read its existing receipt.
    try {
      receipt = await client.request<RemoteInboxReceipt>(
        "inbox.provider.result",
        { requestId },
        { signal },
      );
    } catch (confirmationError) {
      if (!writes) throw confirmationError;
      throw uncertainResult(
        "The desktop may have accepted this request. Check the provider before sending again.",
        confirmationError,
      );
    }
  }

  const deadline = Date.now() + 145_000;
  while (receipt.state === "queued" || receipt.state === "running") {
    if (Date.now() > deadline) {
      throw new InboxJobError(
        "The desktop did not report the result. Refresh the conversation before retrying.",
        writes,
      );
    }
    await pause(1_000, signal);
    try {
      receipt = await client.request<RemoteInboxReceipt>(
        "inbox.provider.result",
        { requestId },
        { signal },
      );
    } catch (error) {
      if (!writes) throw error;
      throw uncertainResult(
        "The desktop accepted this request, but its result could not be read. Check the provider before sending again.",
        error,
      );
    }
  }
  if (receipt.state !== "completed") {
    throw new InboxJobError(
      receipt.error ?? "The desktop inbox request could not complete.",
      receipt.state === "uncertain",
    );
  }
  return receipt.result as InboxJobResults[Action];
}
