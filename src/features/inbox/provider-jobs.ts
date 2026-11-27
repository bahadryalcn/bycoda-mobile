import * as Crypto from "expo-crypto";
import type { RemoteInboxReceipt } from "../../../../src/features/inbox/model/remoteInbox";
import { RemoteHostError, type HostTransport } from "@/remote/transport";
import type { InboxJobAction, InboxJobRequest, InboxJobResults } from "./provider-protocol";
import { readPrReviewContext } from "./provider-review-model";
import { readPrChecks, readPrLabels, readPrReviewers } from "../pull-requests/model/results";
import { readJiraBoards,readJiraBoardSnapshot,readJiraTransitions,readJiraWriteOutcome } from "./jira-board-model";

export type InboxRpcClient = Pick<HostTransport, "request">;

export class InboxJobError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
    readonly terminal = false,
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

/**
 * Wait before the next receipt check. The desktop reports a finished job on its next heartbeat
 * (every 1.5 s while it works), so a flat 1 s poll added up to a second after the result was
 * already on the Host. The first checks come sooner; a slow job settles at one check a second,
 * and after about 7 s (a desktop that is busy or offline) at one every 2 s, so a screen of
 * parallel reads does not keep the radio busy for the whole deadline.
 */
export function inboxReceiptPollDelay(poll: number): number {
  return poll >= INBOX_RECEIPT_SLOW_AFTER_POLLS ? 2_000 : Math.min(1_000, 400 + poll * 200);
}

/** Receipt checks before the poll slows down (about 6.8 s of waiting). */
const INBOX_RECEIPT_SLOW_AFTER_POLLS = 8;

/** How long a provider read may wait for the desktop before its section shows a retryable error. */
export const INBOX_READ_DEADLINE_MS = 60_000;

/** Keep one durable request ID and poll its receipt. Accepted writes are never replayed. */
export async function runInboxJob<Action extends InboxJobAction>(
  client: InboxRpcClient,
  request: InboxJobRequest<Action>,
  signal?: AbortSignal,
  requestId = Crypto.randomUUID(),
): Promise<InboxJobResults[Action]> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) throw new InboxJobError("Invalid inbox request ID.");
  const mode = "mode" in request.input ? request.input.mode : undefined;
  const writes = request.action === "comment" || request.action === "pr-action" || request.action === "review" || request.action === "reaction" || ((request.action === "reviewers" || request.action === "labels") && mode !== "list") || request.action === "jira-board-transition" || request.action === "jira-board-move";
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

  // A read that the desktop has not answered by now is reported (with Retry) instead of leaving
  // its section on a placeholder; a write keeps the full deadline because it is never replayed.
  const deadline = Date.now() + (writes ? 145_000 : INBOX_READ_DEADLINE_MS);
  let polls = 0;
  while (receipt.state === "queued" || receipt.state === "running") {
    if (Date.now() > deadline) {
      throw new InboxJobError(
        writes
          ? "The desktop did not report the result. Refresh the conversation before retrying."
          : "Your computer did not answer in time. Check that Bycoda is open on it and try again.",
        writes,
      );
    }
    await pause(inboxReceiptPollDelay(polls++), signal);
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
      receipt.state === "failed",
    );
  }
  return (request.action === "checks" ? readPrChecks(receipt.result) : request.action === "labels" && mode === "list" ? readPrLabels(receipt.result) : request.action === "reviewers" && mode === "list" ? readPrReviewers(receipt.result) : request.action === "review-context" ? readPrReviewContext(receipt.result) : request.action === "jira-boards" ? readJiraBoards(receipt.result) : request.action === "jira-board-read" ? readJiraBoardSnapshot(receipt.result) : request.action === "jira-issue-transitions" ? readJiraTransitions(receipt.result) : request.action === "jira-board-transition" || request.action === "jira-board-move" ? readJiraWriteOutcome(receipt.result) : receipt.result) as InboxJobResults[Action];
}
