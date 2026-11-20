import { createDraftStorageOwner } from "@/state/local-draft-storage";
import { decodeComposerDraft, emptyComposerDraft } from "./composer-draft";
import type { QuestionDraft } from "./session-types";
import type { StagedAttachment } from "./attachment-model";
import type { UserQuestionPrompt } from "./wire";

export const questionAttachmentKey = (machineId: string, sessionId: string) =>
  `bycoda.mobile.question-attachments.v1:${machineId}:${sessionId}`;
export type QuestionAttachmentDraft = {
  environmentId: string;
  draft: QuestionDraft;
  delivery?: UserQuestionPrompt["delivery"];
  failures?: Record<string, string>;
};
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Saved = { version: 1; entries: Record<string, QuestionAttachmentDraft> };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Strict custody decoder: missing/corrupt fields never prove that a file is orphaned. */
export function decodeQuestionAttachments(raw: string | null): Saved {
  if (raw === null) return { version: 1, entries: {} };
  const value = JSON.parse(raw) as Saved;
  if (value?.version !== 1 || !record(value.entries)) throw new Error("Saved question attachments could not be read.");
  for (const entry of Object.values(value.entries)) {
    if (!entry || typeof entry.environmentId !== "string" || !record(entry.draft) ||
      !record(entry.draft.answers) || !Object.values(entry.draft.answers).every(ids => Array.isArray(ids) && ids.every(id => typeof id === "string")) ||
      !record(entry.draft.custom) || !Object.values(entry.draft.custom).every(text => typeof text === "string") ||
      (entry.draft.notes !== undefined && (!record(entry.draft.notes) || !Object.values(entry.draft.notes).every(text => typeof text === "string"))) ||
      (entry.delivery !== undefined && !["sending", "queued", "unknown", "failed"].includes(entry.delivery)) ||
      (entry.failures !== undefined && (!record(entry.failures) || !Object.values(entry.failures).every(text => typeof text === "string"))) ||
      (entry.draft.attachments !== undefined && !record(entry.draft.attachments)))
      throw new Error("Saved question attachments could not be read.");
    const files = Object.values(entry.draft.attachments ?? {}).flat();
    // Reuse the canonical staged-file/claim validator and aggregate Host count limit.
    decodeComposerDraft(`bycoda-composer-v2:\n${JSON.stringify({ ...emptyComposerDraft(), attachments: files })}`);
  }
  return value;
}
export const questionDraftFiles = (entry: QuestionAttachmentDraft): StagedAttachment[] =>
  Object.values(entry.draft.attachments ?? {}).flat();

/** Trailing delay for free-text edits; the in-memory entry is published on every keystroke regardless. */
export const QUESTION_DRAFT_DEBOUNCE_MS = 400;
type Batch = { promise: Promise<void>; resolve(): void; reject(error: unknown): void; timer?: ReturnType<typeof setTimeout> };
function deferred(): Batch {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const stores = new WeakMap<object, Map<string, QuestionAttachmentDraftStore>>();
/** Custody survives navigation and failed disk writes. It is not a disposable text draft:
 * queued/unknown answers remain held even when ordinary saved drafts are cleared. */
export class QuestionAttachmentDraftStore {
  private readonly owner;
  private loaded = false;
  private entries: Record<string, QuestionAttachmentDraft> = {};
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private flights = new Set<string>();
  private batch?: Batch;
  private authoritative?: { revision: number; identities: ReadonlySet<string> };
  constructor(private readonly storage: Storage, readonly key: string) {
    this.owner = createDraftStorageOwner(storage, key);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  private notify() { this.revision++; for (const listener of this.listeners) listener(); }
  read(identity: string) { return this.entries[identity]; }
  all() { return Object.entries(this.entries); }
  observe(revision: number, identities: ReadonlySet<string>) {
    if (this.authoritative && revision < this.authoritative.revision) return () => false;
    const snapshot = this.authoritative = { revision, identities };
    return (identity: string) => this.authoritative === snapshot && !snapshot.identities.has(identity);
  }
  files() { return Object.values(this.entries).flatMap(questionDraftFiles); }
  busy(identity: string) { return this.flights.has(identity); }
  async exclusive<T>(identity: string, operation: () => Promise<T>): Promise<T> {
    if (this.busy(identity)) throw new Error("Wait for the attachment operation to finish.");
    this.flights.add(identity); this.notify();
    try { return await operation(); } finally { this.flights.delete(identity); this.notify(); }
  }
  hydrate(): Promise<void> {
    return this.owner.run(async () => {
      if (this.loaded) return;
      const saved = decodeQuestionAttachments(await this.storage.getItem(this.key));
      this.entries = { ...saved.entries, ...this.entries }; this.loaded = true; this.notify();
    });
  }
  /** Publish memory before disk: failure retains the only available copy and blocks dispatch. */
  save(identity: string, entry: QuestionAttachmentDraft): Promise<void> {
    this.publish(identity, entry);
    return this.flush();
  }
  /** Typing path: memory is exact and immediate, disk is coalesced to one trailing write. Every
   * coalesced caller shares the batch result, so a failed write still reaches each caller's handler. */
  saveLater(identity: string, entry: QuestionAttachmentDraft, delay = QUESTION_DRAFT_DEBOUNCE_MS): Promise<void> {
    this.publish(identity, entry);
    const batch = this.batch ??= deferred();
    clearTimeout(batch.timer);
    batch.timer = setTimeout(() => { void this.flush().catch(() => {}); }, delay);
    return batch.promise;
  }
  /** Writes every unwritten occurrence now (submit, blur, unmount, background). A failed write keeps
   * the entries dirty, so the next flush retries and nothing is dropped. */
  flush(): Promise<void> {
    const batch = this.batch; this.batch = undefined; clearTimeout(batch?.timer);
    if (!batch && !this.dirty.size) return Promise.resolve();
    const written = this.persist();
    if (batch) written.then(batch.resolve, batch.reject);
    return written;
  }
  private publish(identity: string, entry: QuestionAttachmentDraft) {
    this.entries = { ...this.entries, [identity]: entry }; this.dirty.add(identity); this.notify();
  }
  private persist(): Promise<void> {
    return this.owner.run(async () => {
      const saved = decodeQuestionAttachments(await this.storage.getItem(this.key));
      const writing = new Map([...this.dirty].map(id => [id, this.entries[id]]));
      for (const [id, value] of writing) saved.entries[id] = value;
      await this.storage.setItem(this.key, JSON.stringify(saved));
      for (const [id, value] of writing) if (this.entries[id] === value) this.dirty.delete(id);
      this.loaded = true;
    });
  }
  replace(identity: string, update: (current: QuestionAttachmentDraft) => QuestionAttachmentDraft): Promise<void> {
    return this.owner.run(async () => {
      const before = this.entries[identity];
      const entry = update(before);
      const saved = decodeQuestionAttachments(await this.storage.getItem(this.key));
      saved.entries[identity] = entry;
      await this.storage.setItem(this.key, JSON.stringify(saved));
      const concurrent = this.entries[identity];
      // Another mounted editor can finish a keystroke while disk is writing. Keep
      // its text, while the successful removal owns the attachment collection.
      this.entries = { ...this.entries, [identity]: concurrent !== before
        ? { ...entry, ...concurrent, draft: { ...concurrent.draft, attachments: entry.draft.attachments } }
        : entry };
      if (concurrent === before) this.dirty.delete(identity);
      this.notify();
    });
  }
  /** Caller stages release first. Failed removal leaves both memory and disk retaining custody. */
  remove(identity: string, allowed: () => boolean = () => true): Promise<void> {
    return this.owner.run(async () => {
      if (!allowed()) return;
      const before = this.entries[identity];
      const saved = decodeQuestionAttachments(await this.storage.getItem(this.key));
      delete saved.entries[identity];
      if (!allowed()) return;
      await this.storage.setItem(this.key, JSON.stringify(saved));
      if (this.entries[identity] === before) { delete this.entries[identity]; this.dirty.delete(identity); this.notify(); }
    });
  }
}
export function questionAttachmentStore(storage: Storage, machineId: string, sessionId: string) {
  let keys = stores.get(storage);
  if (!keys) { keys = new Map(); stores.set(storage, keys); }
  const key = questionAttachmentKey(machineId, sessionId);
  let store = keys.get(key);
  if (!store) { store = new QuestionAttachmentDraftStore(storage, key); keys.set(key, store); }
  return store;
}
/** Background/lock: write every session's pending text before the process can be suspended or killed. */
export function flushQuestionAttachmentDrafts(storage: Storage): Promise<unknown> {
  return Promise.allSettled([...(stores.get(storage)?.values() ?? [])].map(store => store.flush()));
}
export function retainedQuestionFiles(storage: Storage, machineId: string, sessionId: string): StagedAttachment[] {
  return stores.get(storage)?.get(questionAttachmentKey(machineId, sessionId))?.files() ?? [];
}
