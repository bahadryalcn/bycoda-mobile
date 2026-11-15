import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { ComposerDelivery } from "./composer-delivery";

/** Only a new queue starts implicitly. Restored, stopped and edited work needs an explicit resume. */
export function freshMobileQueue(queue: SharedQueue): boolean {
  return (
    !queue.messages.length &&
    !queue.status &&
    !queue.holdReason &&
    !queue.editingId &&
    !queue.claim &&
    !queue.consumer &&
    !queue.drain
  );
}

export function appendMobileQueue(queue: SharedQueue, row: QueuedMessage): SharedQueue {
  if (queue.messages.some((entry) => entry.id === row.id)) return queue;
  return {
    ...queue,
    messages: [...queue.messages, row],
    status: queue.status ?? (freshMobileQueue(queue) ? "active" : "paused"),
  };
}

/** Leased hosts drain durably; only older hosts need this visible screen to send. */
export function mobileDrainsQueue(queue: SharedQueue, clientId: string): boolean {
  return (
    !queue.leased &&
    queue.consumer === clientId &&
    queue.status === "active" &&
    !!queue.messages.length &&
    !queue.editingId &&
    !queue.claim &&
    !queue.messages.some((row) => row.deliveryUnknown)
  );
}

/** A stale Steer choice must never trap the next idle message behind a disabled action. */
export function deliveryAfterRun(
  mode: ComposerDelivery,
  wasRunning: boolean,
  running: boolean,
  explicitlyChosen = true,
): ComposerDelivery {
  return wasRunning && !running && (mode === "steer" || !explicitlyChosen) ? "send" : mode;
}

/** The owner's decision for a row nobody confirmed (desktop `DeliveryReviewChoice`). */
export type QueueDeliveryReview = "delivered" | "retry" | "keep" | "discard";

/**
 * Settles an unconfirmed row as desktop `resolveUnknownRow` does: delivered and discard remove it,
 * send again clears the mark and lets the queue drain, keep clears the mark and pauses the queue.
 * Nothing is ever resent without this explicit choice.
 */
export function resolveQueuedDelivery(
  queue: SharedQueue,
  id: string,
  outcome: QueueDeliveryReview,
): SharedQueue {
  if (!queue.messages.some((row) => row.id === id && row.deliveryUnknown)) return queue;
  const held = queue.status === "restored" ? "restored" : "paused";
  const editingId = queue.editingId === id ? undefined : queue.editingId;
  if (outcome === "delivered" || outcome === "discard") {
    const messages = queue.messages.filter((row) => row.id !== id);
    return {
      ...queue,
      messages,
      status: messages.length ? held : undefined,
      editingId,
    };
  }
  return {
    ...queue,
    messages: queue.messages.map((row) =>
      row.id === id ? { ...row, deliveryUnknown: undefined } : row,
    ),
    status: outcome === "retry" ? "active" : held,
    editingId,
  };
}

export type QueueDeliveryStage =
  | { stage: "sending"; id: string }
  | { stage: "unknown"; id: string }
  | { stage: "stopped" }
  | { stage: "rejected"; detail?: string }
  | { stage: "accepted"; id: string; token: string };

/**
 * One delivery state for the queue, in the desktop order: a claimed row is sending, an unconfirmed
 * row needs the owner's decision, a held queue says why (Stop or a provider refusal), and a send
 * the Host settled as accepted is delivered. Null when rows are simply queued.
 */
export function queueDeliveryStage(queue: SharedQueue | undefined): QueueDeliveryStage | null {
  if (!queue) return null;
  if (queue.claim && queue.messages.some((row) => row.id === queue.claim!.id))
    return { stage: "sending", id: queue.claim.id };
  const unknown = queue.messages.find((row) => row.deliveryUnknown);
  if (unknown) return { stage: "unknown", id: unknown.id };
  if (queue.status === "paused" && queue.holdReason)
    return queue.holdReason === "stopped"
      ? { stage: "stopped" }
      : { stage: "rejected", detail: queue.holdReason };
  if (queue.settled && !queue.settled.accepted && queue.status === "paused")
    return { stage: "rejected" };
  if (
    queue.settled?.accepted &&
    queue.settled.id &&
    !queue.messages.some((row) => row.id === queue.settled!.id)
  )
    return {
      stage: "accepted",
      id: queue.settled.id,
      token: queue.settled.token,
    };
  return null;
}
