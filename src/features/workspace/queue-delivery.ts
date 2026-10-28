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
