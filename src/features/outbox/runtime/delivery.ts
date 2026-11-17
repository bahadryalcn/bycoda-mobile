import { randomUUID } from "expo-crypto";
import type { HostTransport } from "@/remote/transport";
import { readTail, type HostSession, type CommandReceipt } from "../../workspace/wire";
import { uploadAttachment } from "../../workspace/attachment-transfer";
import { attachmentReleases } from "../../workspace/attachment-ownership";
import { queueAttachmentOwner } from "../../workspace/queue-attachment-ownership";
import { appendMobileQueue } from "../../workspace/queue-delivery";
import type { SharedQueue } from "../../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../../src/features/sessions/model/session";
import { matchesOutboxModel, offlineSendFailure, OUTBOX_CAPABILITY, type OutboxRow } from "../model/outbox";
import { sendOutbox } from "./store";
import { finishOutbox } from "./custody";

const active = new Set<string>();
const sessionKey = (row: Pick<OutboxRow, "machineId" | "sessionId">) => `${row.machineId}:${row.sessionId}`;
export function lockOutbox(row: Pick<OutboxRow, "machineId" | "sessionId">): (() => void) | null {
  const key = sessionKey(row);
  if (active.has(key)) return null;
  active.add(key);
  return () => { active.delete(key); };
}

/** Existing queue custody and CAS path; Host receipts survive queue draining. */
async function enqueue(client: HostTransport, row: OutboxRow, attachments: QueuedMessage["attachments"], check: () => void) {
  const clientId = `outbox:${row.id}`;
  const params = { sessionId: row.sessionId, clientId, leaseAware: true };
  const owner = queueAttachmentOwner(client, row.sessionId);
  const before = await owner.request(client, "sessions.queue.get", params, {}) as SharedQueue;
  check();
  if (before.messages.some(value => value.id === row.id)) return;
  if (before.claim) throw new Error("Wait for the queued send to finish before changing the queue.");
  const { sessionId: _sessionId, ...command } = row.command;
  const message = { ...command, id: row.id, attachments, modelTarget: row.model } as unknown as QueuedMessage;
  row.attempted = true;
  await sendOutbox.update(row);
  check();
  await owner.request(client, "sessions.queue.change", { ...params, before, after: appendMobileQueue(before, message) }, { retry: false });
}

/** Flush one session in order. Every awaited boundary rechecks account/access. */
export async function flushOutboxSession(client: HostTransport, sessionId: string, accountId: string, current: () => boolean, force = false, sameAccount = current) {
  if (!client.machine.capabilities?.includes(OUTBOX_CAPABILITY)) return;
  const unlock = lockOutbox({ machineId: client.machine.id, sessionId });
  if (!unlock) return;
  try {
    for (const row of await sendOutbox.read(client.machine.id, sessionId)) {
      if (row.status === "dropped" || row.status === "delivered") continue;
      if (row.status === "blocked" && !force) break;
      const identityCurrent = () => sameAccount() && row.accountId === accountId && client.machine.environmentId === row.environmentId;
      const allowed = () => current() && identityCurrent();
      const check = () => { if (!allowed()) throw new Error("Outbox account changed."); client.assertCurrentAccess?.(); };
      if (!identityCurrent() || Date.now() - row.createdAt > 24 * 60 * 60 * 1000) {
        row.status = "dropped";
        await sendOutbox.update(row);
        continue;
      }
      if (!current()) break;
      try {
        check();
        const session = await readTail(client, sessionId);
        check();
        if (session.projectId !== row.projectId) throw new Error("Session project changed. Review this message before retrying.");
        if (session.archived) {
          row.status = "dropped";
          await sendOutbox.update(row);
          continue;
        }
        // Receipt lookup precedes model/running checks: acceptance may have changed both.
        if (row.mode !== "queue") {
          const receipt = await client.request<CommandReceipt | null>("commands.status", { commandId: row.id });
          check();
          if (receipt) { await finishOutbox(row, client); continue; }
        }
        if (row.mode === "queue" && row.attempted) {
          await enqueue(client, row, row.command.attachments as QueuedMessage["attachments"], check);
          check();
          await finishOutbox(row, client);
          continue;
        }
        if (!matchesOutboxModel(row, session)) throw new Error("Restore the original model before retrying this message.");
        if (row.mode === "send" && session.status === "running") break;
        const attachments = [];
        for (const file of row.draft.attachments) {
          check();
          if (!file.claimId) {
            file.claimId = randomUUID();
            await sendOutbox.update(row);
          }
          check();
          attachments.push(await uploadAttachment(client, file, sessionId, new AbortController().signal, () => {}, "composer", check));
        }
        check();
        await attachmentReleases.stage(client, sessionId, row.draft.attachments);
        check();
        if (row.mode === "queue") await enqueue(client, row, attachments, check);
        else {
          row.attempted = true;
          await sendOutbox.update(row);
          check();
          await client.request("commands.dispatch", { ...row.command, attachments, commandId: row.id, clientMessageId: row.id }, { retry: false });
        }
        check();
        await finishOutbox(row, client);
      } catch (error) {
        if ((row as OutboxRow).status === "delivered") break;
        if (!identityCurrent() || (error as { message?: string }).message === "Session not found on this machine" ||
          (error as { message?: string }).message === "Session is archived") row.status = "dropped";
        else row.status = !current() || offlineSendFailure(error) ? "waiting" : "blocked";
        await sendOutbox.update(row);
        break;
      }
    }
  } finally { unlock(); }
}
