import type {
  HostSession,
  RemoteAttachment,
} from "../../../../src/features/connections/model/protocol";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import type { NoteComposerCard } from "../../../../src/features/notes/notes";
import { readNoteContext } from "../../../../src/features/notes/noteContext";
import { captureSessionAuthority } from "@/domain/session-authority";

export type ComposerDelivery = "send" | "queue" | "steer";

export function desktopOwnsTurn(session: Pick<HostSession, "executionOwner" | "runId">): boolean {
  return (
    session.executionOwner === "desktop" || (!session.executionOwner && session.runId === "desktop")
  );
}

export const queuedDeliveryUnknown =
  "Delivery is unconfirmed. Review this message on the sending computer before resuming the queue.";

export function validateNoteDelivery(
  noteCard: NoteComposerCard | undefined,
  mode: ComposerDelivery,
  text: string,
  supported: boolean,
) {
  if (!noteCard) return;
  if (!supported)
    throw new Error(
      "Update bycoda on this computer to send note context. Your draft is preserved.",
    );
  const command = /^\s*\/(plan|draft|compact|build|clear|new)(?:\s|$)/i.exec(text)?.[1].toLowerCase();
  if (command === "plan") throw new Error("Turn off Plan mode or remove the note.");
  if (command === "draft") throw new Error("Turn off Draft mode or remove the note.");
  if (command) throw new Error("Remove the command at the start of the message or remove the note.");
  if (mode !== "send") throw new Error("To keep the note, send this message after the current turn finishes.");
  readNoteContext(noteCard);
}

const DRAFT_COMMAND = /^\s*\/draft(?=\s|$)/i;

/** Draft mode saves the message on the Host without starting the agent (Host `draft` command). */
function draftCommand(
  session: HostSession,
  text: string,
  attachments: RemoteAttachment[],
): Record<string, unknown> {
  const body = text.replace(/^\s*\/draft(?=\s|$)\s*/i, "");
  if (!body.trim() && !attachments.length)
    throw new Error("Describe the message or add a file before saving a draft.");
  if (session.status === "running")
    throw new Error("A draft cannot be saved while the agent is running.");
  if (session.session.blocks.some((block) => block.draft))
    throw new Error("This session already has a draft. Send or remove it first.");
  return {
    type: "draft",
    ...captureSessionAuthority(session),
    sessionId: session.session.id,
    text: body,
    attachments,
  };
}

/** The selected delivery mode never silently changes into a different action. */
export function composerCommand(
  session: HostSession,
  mode: Exclude<ComposerDelivery, "queue">,
  text: string,
  attachments: RemoteAttachment[],
  noteCard?: NoteComposerCard,
  contextReplay?: string,
): Record<string, unknown> {
  validateNoteDelivery(noteCard, mode, text, true);
  if (mode === "steer") {
    if (desktopOwnsTurn(session))
      throw new Error(
        "This turn is running in the desktop app. Steer it there or queue your message.",
      );
    if (session.status !== "running" || !session.runId)
      throw new Error("Refresh the running turn before steering it.");
    return {
      type: "steer",
      ...captureSessionAuthority(session),
      sessionId: session.session.id,
      runId: session.runId,
      text,
      attachments,
    };
  }
  if (DRAFT_COMMAND.test(text)) return draftCommand(session, text, attachments);
  if (session.status === "running")
    throw new Error("Wait for this turn, queue your message, or choose Steer.");
  if (/^\s*\/compact\s*$/.test(text)) {
    if (attachments.length) throw new Error("Remove attachments before compacting context.");
    return { type: "compact", sessionId: session.session.id, ...captureSessionAuthority(session) };
  }
  const plan = /^\s*\/plan\s+\S/.test(text);
  return {
    type: "send",
    ...captureSessionAuthority(session),
    sessionId: session.session.id,
    text: plan ? text.replace(/^\s*\/plan\s+/, "") : text,
    ...(plan ? { intent: "plan" } : {}),
    attachments,
    ...(noteCard ? { noteCard: readNoteContext(noteCard) } : {}),
    ...(contextReplay ? { contextReplay } : {}),
  };
}

export function queuedComposerMessage(
  id: string,
  session: HostSession,
  text: string,
  attachments: RemoteAttachment[],
  noteCard?: NoteComposerCard,
): QueuedMessage {
  validateNoteDelivery(noteCard, "queue", text, true);
  const plan = /^\s*\/plan\s+\S/.test(text);
  return {
    id,
    ...captureSessionAuthority(session),
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
  if (row?.deliveryUnknown) throw new Error(queuedDeliveryUnknown);
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
    // A queued row is an existing intent, including a captured legacy absence.
    ...captureSessionAuthority(row),
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
