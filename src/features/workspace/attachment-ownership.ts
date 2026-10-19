import { randomUUID } from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HostTransport } from "@/remote/transport";
import type { RemoteRequestOptions } from "@/remote/types";
import { decodeComposerDraft } from "./composer-draft";

export const ATTACHMENT_OWNERSHIP_CAPABILITY = "attachments.ownership.v1";
const outboxKey = "bycoda.mobile.attachment-releases.v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
type Release = { machineId: string; environmentId: string; sessionId: string; claimId: string; ids: string[] };
type ClaimedFile = { id: string; claimId?: string };
export const composerDraftKey = (machineId: string, sessionId: string) =>
  `bycoda.mobile.draft.v1:${machineId}:${sessionId}`;
export function attachmentOwnerId(sessionId: string): string {
  const ownerId = `mobile:${sessionId}`;
  if (!sessionId || ownerId.length > 128) throw new Error("Invalid attachment draft owner.");
  return ownerId;
}
export const supportsAttachmentOwnership = (client: Pick<HostTransport, "machine">) =>
  client.machine.capabilities?.includes(ATTACHMENT_OWNERSHIP_CAPABILITY) === true;

/** Non-secret durable release intents. Disk draft references always win over an intent.
 * Crashes before durable removal retain the claim; failed release remains retryable. */
export class AttachmentReleaseOutbox {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: Storage, private readonly nonce = randomUUID) {}
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(operation);
    this.tail = result;
    return result;
  }
  private async read(): Promise<Release[]> {
    const raw = await this.storage.getItem(outboxKey);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((entry: Release) =>
      !entry || typeof entry.machineId !== "string" || typeof entry.environmentId !== "string" ||
      typeof entry.claimId !== "string" || !uuid.test(entry.claimId) ||
      typeof entry.sessionId !== "string" || !entry.sessionId || entry.sessionId.length > 121 ||
      !Array.isArray(entry.ids) || entry.ids.some((id) => typeof id !== "string" || !uuid.test(id))))
      throw new Error("Saved attachment release intents could not be read.");
    return value as Release[];
  }
  prepare(client: HostTransport, sessionId: string, file: ClaimedFile): Promise<string> {
    return this.serialize(async () => {
      const releases = await this.read();
      const pending = releases.some((entry) => entry.machineId === client.machine.id &&
        entry.environmentId === client.machine.environmentId && entry.sessionId === sessionId &&
        entry.claimId === file.claimId && entry.ids.includes(file.id));
      // Re-adding after removal is a new lifecycle. Old release RPCs can never
      // delete this new generation, even if their earlier response was lost.
      return !file.claimId || pending ? this.nonce() : file.claimId;
    });
  }
  claim(client: HostTransport, sessionId: string, ids: readonly string[], claimId: string, options: RemoteRequestOptions): Promise<void> {
    return this.serialize(async () => {
      await client.request("attachments.claim", { ownerId: attachmentOwnerId(sessionId), claimId, ids: [...ids] }, { ...options, retry: false });
    });
  }
  stage(client: Pick<HostTransport, "machine">, sessionId: string, files: readonly ClaimedFile[]): Promise<void> {
    if (!supportsAttachmentOwnership(client) || !files.length) return Promise.resolve();
    attachmentOwnerId(sessionId);
    if (files.some((file) => !uuid.test(file.id) || (file.claimId !== undefined && !uuid.test(file.claimId))))
      return Promise.reject(new Error("Invalid attachment claim."));
    return this.serialize(async () => {
      const releases = await this.read();
      for (const file of files) {
        // Pre-migration files have no managed claim to release.
        if (!file.claimId) continue;
        const same = releases.find((entry) => entry.machineId === client.machine.id &&
          entry.environmentId === client.machine.environmentId && entry.sessionId === sessionId && entry.claimId === file.claimId);
        if (same) same.ids = [...new Set([...same.ids, file.id])];
        else releases.push({ machineId: client.machine.id, environmentId: client.machine.environmentId, sessionId, claimId: file.claimId, ids: [file.id] });
      }
      await this.storage.setItem(outboxKey, JSON.stringify(releases));
    });
  }
  flush(client: HostTransport): Promise<void> {
    if (!supportsAttachmentOwnership(client)) return Promise.resolve();
    return this.serialize(async () => {
      const releases = await this.read();
      for (const entry of [...releases]) {
        if (entry.machineId !== client.machine.id || entry.environmentId !== client.machine.environmentId) continue;
        // Read/decode failures fail closed: an unread draft never authorizes release.
        const raw = await this.storage.getItem(composerDraftKey(entry.machineId, entry.sessionId));
        if (raw !== null && !raw.startsWith("bycoda-composer-v2:\n"))
          throw new Error("Saved attachment draft ownership is unknown.");
        const retained = new Set(raw === null ? [] : decodeComposerDraft(raw).attachments.filter((file) => !file.claimId || file.claimId === entry.claimId).map((file) => file.id));
        const ready = entry.ids.filter((id) => !retained.has(id));
        for (let at = 0; at < ready.length; at += 20) {
          const ids = ready.slice(at, at + 20);
          await client.request("attachments.release", { ownerId: attachmentOwnerId(entry.sessionId), claimId: entry.claimId, ids }, { retry: false });
          entry.ids = entry.ids.filter((id) => !ids.includes(id));
          if (!entry.ids.length) releases.splice(releases.indexOf(entry), 1);
          // A lost response or failed write repeats only the same idempotent release.
          await this.storage.setItem(outboxKey, JSON.stringify(releases));
        }
      }
    });
  }
}
export const attachmentReleases = new AttachmentReleaseOutbox(AsyncStorage);
