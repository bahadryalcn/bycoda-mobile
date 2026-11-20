import { decodeComposerDraft, encodeComposerDraft, type ComposerDraft } from "../../workspace/composer-draft";
import type { HostSession } from "../../workspace/wire";
import type { ComposerDelivery } from "../../workspace/composer-delivery";
import { createDraftStorageOwner } from "../../../state/local-draft-storage";

export const OUTBOX_CAPABILITY = "sessions.clientMessageId.v1";
export const OUTBOX_PREFIX = "bycoda.mobile.outbox.v1:";
export const outboxKey = (machineId: string, sessionId: string) => `${OUTBOX_PREFIX}${machineId}:${sessionId}`;
export type OutboxRow = {
  id: string;
  machineId: string;
  environmentId: string;
  sessionId: string;
  projectId: string;
  accountId: string;
  createdAt: number;
  mode: ComposerDelivery;
  draft: ComposerDraft;
  command: Record<string, unknown>;
  model: Pick<HostSession["session"], "harness" | "model" | "modelSettings" | "providerAccountId">;
  status: "waiting" | "blocked" | "dropped" | "delivered";
  /** Why a blocked row stopped: it waited past the automatic-replay window and needs an explicit owner decision. */
  blockedReason?: "expired";
  attempted: boolean;
};
/** Older waiting messages are never replayed automatically; they wait for Retry or Edit. */
export const OUTBOX_AUTO_REPLAY_MS = 24 * 60 * 60 * 1000;
/** A future `createdAt` (clock corrected backwards) is never expired. */
export const outboxExpired = (row: Pick<OutboxRow, "createdAt">, now = Date.now()) => now - row.createdAt > OUTBOX_AUTO_REPLAY_MS;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The existing draft codec preserves extension fields, including across explicit Edit. */
export function outboxDraftIdentity(draft: ComposerDraft): string | undefined {
  const value = (draft as ComposerDraft & { clientMessageId?: unknown }).clientMessageId;
  if (value === undefined) return;
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("Saved message identity is invalid.");
  return value.toLowerCase();
}

/** Fail closed: damaged storage must never authorize replay or file cleanup. */
export function decodeOutbox(raw: string | null): OutboxRow[] {
  if (raw === null) return [];
  if (raw.length > 2_000_000) throw new Error("Saved outbox could not be read.");
  const rows: OutboxRow[] = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Saved outbox could not be read.");
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || !uuid.test(row.id) || ids.has(row.id) ||
      ![row.machineId, row.environmentId, row.sessionId, row.projectId, row.accountId].every(value => typeof value === "string" && value.length > 0 && value.length <= 4096) ||
      !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 ||
      !["send", "queue", "steer"].includes(row.mode) ||
      !["waiting", "blocked", "dropped", "delivered"].includes(row.status) || typeof row.attempted !== "boolean" ||
      (row.blockedReason !== undefined && row.blockedReason !== "expired") ||
      !row.command || row.command.sessionId !== row.sessionId || row.command.clientMessageId !== row.id ||
      !row.model || typeof row.model.model !== "string" || typeof row.model.harness !== "string")
      throw new Error("Saved outbox could not be read.");
    ids.add(row.id);
    row.draft = decodeComposerDraft(`bycoda-composer-v2:\n${JSON.stringify(row.draft)}`);
    if (encodeComposerDraft(row.draft) === null) throw new Error("Saved outbox could not be read.");
  }
  return rows;
}

/** Only the account and computer that captured a message may move it back into a composer. */
export const outboxOwned = (row: Pick<OutboxRow, "accountId" | "environmentId">, accountId: string | undefined, environmentId: string | undefined) =>
  !!accountId && row.accountId === accountId && row.environmentId === environmentId;

/** One visible reason per stopped row, so the footer never lumps separate causes together. */
export function outboxNoticeKind(row: Pick<OutboxRow, "status" | "blockedReason">, owned: boolean): "foreign" | "unavailable" | "expired" | "blocked" | "waiting" {
  if (row.status === "dropped") return owned ? "unavailable" : "foreign";
  if (row.status === "blocked") return row.blockedReason === "expired" ? "expired" : "blocked";
  return "waiting";
}

/** Only transport failures enter automatic replay, and only on idempotent Hosts. */
export function offlineSendFailure(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { kind?: string; name?: string };
  return error.kind === "network" || error.kind === "timeout" || error.name === "UncertainCommand";
}

export function matchesOutboxModel(row: OutboxRow, session: HostSession): boolean {
  return row.model.harness === session.session.harness && row.model.model === session.session.model &&
    row.model.providerAccountId === session.session.providerAccountId &&
    JSON.stringify(Object.entries(row.model.modelSettings ?? {}).sort()) === JSON.stringify(Object.entries(session.session.modelSettings ?? {}).sort());
}

export function sameOutboxDraft(left: ComposerDraft, right: ComposerDraft): boolean {
  return left.text === right.text && JSON.stringify(left.noteCard) === JSON.stringify(right.noteCard) &&
    JSON.stringify(left.selectedMentionRefs) === JSON.stringify(right.selectedMentionRefs) &&
    JSON.stringify(left.attachments.map(({ claimId: _claimId, ...file }) => file)) ===
      JSON.stringify(right.attachments.map(({ claimId: _claimId, ...file }) => file));
}

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; getAllKeys(): Promise<readonly string[]> };

/** One writer across all sessions. Full storage rejects new sends, never evicts drafts. */
export class SendOutbox {
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: Storage) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  read(machineId: string, sessionId: string) { return this.readKey(outboxKey(machineId, sessionId)); }
  private async readKey(key: string) {
    const rows = decodeOutbox(await this.storage.getItem(key));
    if (rows.some(row => outboxKey(row.machineId, row.sessionId) !== key)) throw new Error("Saved outbox could not be read.");
    return rows;
  }
  private change<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(work);
    this.tail = result;
    return result.then(value => { this.listeners.forEach(listener => listener()); return value; });
  }
  async all(): Promise<OutboxRow[]> {
    const keys = (await this.storage.getAllKeys()).filter(key => key.startsWith(OUTBOX_PREFIX));
    return (await Promise.all(keys.map(key => this.readKey(key)))).flat();
  }
  put(row: OutboxRow, existingOnly = false): Promise<void> {
    const key = outboxKey(row.machineId, row.sessionId);
    const owner = createDraftStorageOwner(this.storage, key);
    return this.change(() => owner.run(async () => {
      const rows = await this.readKey(key);
      const at = rows.findIndex(value => value.id === row.id);
      if (existingOnly && at < 0) throw new Error("This waiting message was removed.");
      const all = await this.all();
      const other = all.filter(value => value.machineId !== row.machineId || value.sessionId !== row.sessionId || value.id !== row.id);
      if (JSON.stringify(other).length + JSON.stringify(row).length > 8_000_000 ||
        (at < 0 && (rows.length >= 100 || all.length >= 200)))
        throw new Error("Outbox is full. Your draft is preserved.");
      if (at < 0) {
        rows.push(row);
      } else rows[at] = row;
      const raw = JSON.stringify(rows);
      if (raw.length > 2_000_000) throw new Error("Outbox is full. Your draft is preserved.");
      decodeOutbox(raw);
      await this.storage.setItem(key, raw);
    }));
  }
  update(row: OutboxRow) { return this.put(row, true); }
  remove(row: OutboxRow): Promise<void> {
    return this.change(async () => {
      const key = outboxKey(row.machineId, row.sessionId);
      const rows = await this.readKey(key);
      await this.storage.setItem(key, JSON.stringify(rows.filter(value => value.id !== row.id)));
    });
  }
  dropAccount(accountId: string | null): Promise<void> {
    return this.change(async () => {
      for (const key of (await this.storage.getAllKeys()).filter(key => key.startsWith(OUTBOX_PREFIX))) {
        await createDraftStorageOwner(this.storage, key).run(async () => {
          const rows = await this.readKey(key);
          for (const row of rows) if (row.status !== "delivered" && row.accountId !== accountId) row.status = "dropped";
          await this.storage.setItem(key, JSON.stringify(rows));
        });
      }
    });
  }
}
