import type {
  HostSession,
  RemoteAttachment,
} from "../../../../src/features/connections/model/protocol";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";

export type ComposerDelivery = "send" | "queue" | "steer";

/** The selected delivery mode never silently changes into a different action. */
export function composerCommand(
  session: HostSession,
  mode: Exclude<ComposerDelivery, "queue">,
  text: string,
  attachments: RemoteAttachment[],
): Record<string, unknown> {
  if (mode === "steer") {
    if (session.status !== "running" || !session.runId)
      throw new Error("Refresh the running turn before steering it.");
    return {
      type: "steer",
      sessionId: session.session.id,
      runId: session.runId,
      text,
      attachments,
    };
  }
  if (session.status === "running")
    throw new Error("Wait for this turn, queue your message, or choose Steer.");
  if (/^\s*\/compact\s*$/.test(text)) {
    if (attachments.length) throw new Error("Remove attachments before compacting context.");
    return { type: "compact", sessionId: session.session.id };
  }
  const plan = /^\s*\/plan\s+\S/.test(text);
  return {
    type: "send",
    sessionId: session.session.id,
    text: plan ? text.replace(/^\s*\/plan\s+/, "") : text,
    ...(plan ? { intent: "plan" } : {}),
    attachments,
  };
}

export function queuedComposerMessage(
  id: string,
  session: HostSession,
  text: string,
  attachments: RemoteAttachment[],
): QueuedMessage {
  const plan = /^\s*\/plan\s+\S/.test(text);
  return {
    id,
    text: plan ? text.replace(/^\s*\/plan\s+/, "") : text,
    attachments,
    ...(plan ? { intent: "plan" as const } : {}),
    modelTarget: {
      harness: session.session.harness,
      model: session.session.model,
      modelSettings: { ...session.session.modelSettings },
    },
  };
}

export function queuedCommand(queue: SharedQueue, session: HostSession, clientId: string) {
  const row = queue.messages[0];
  if (
    !row ||
    queue.claim ||
    queue.editingId ||
    queue.status !== "active" ||
    queue.consumer !== clientId
  )
    throw new Error("Refresh or resume the queue before sending.");
  if (session.status === "running")
    throw new Error("Wait for this turn, queue your message, or choose Steer.");
  if (row.attachments.some((file) => file.missing))
    throw new Error(
      "This queued message has missing files. Repair its attachments on your computer before sending.",
    );
  if (row.noteCard || row.handoffCard || row.intent === "orchestrate")
    throw new Error("Send this queued message from your computer to preserve its special content.");
  const target = row.modelTarget;
  if (
    target &&
    (target.harness !== session.session.harness ||
      target.model !== session.session.model ||
      JSON.stringify(Object.entries(target.modelSettings).sort()) !==
        JSON.stringify(Object.entries(session.session.modelSettings ?? {}).sort()))
  )
    throw new Error(
      "This queued message uses different model settings. Restore its model before sending.",
    );
  // Queue rows already carry parsed intent. Reinterpreting /plan here would
  // change their text and fail the host's exact queued-content verification.
  const command = /^\s*\/compact\s*$/.test(row.text)
    ? composerCommand(session, "send", row.text, row.attachments)
    : { type: "send", sessionId: session.session.id, text: row.text, attachments: row.attachments };
  return {
    ...command,
    ...(row.intent ? { intent: row.intent } : {}),
    queued: { id: row.id, clientId, revision: queue.revision },
  };
}

export function moveQueuedMessage(queue: SharedQueue, id: string, delta: -1 | 1): SharedQueue {
  const messages = [...queue.messages];
  const from = messages.findIndex((row) => row.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= messages.length) return queue;
  [messages[from], messages[to]] = [messages[to]!, messages[from]!];
  return { ...queue, messages };
}
