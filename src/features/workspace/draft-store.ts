import { createDraftStorageOwner, DraftWriteError, publishDraftPresence, RetiredDraftError } from "@/state/local-draft-storage";
export { DraftWriteError } from "@/state/local-draft-storage";

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Navigation creates a new store while the outgoing editor can still be flushing.
// Share pending writes by storage/key so its replacement cannot read stale data.

/** Failed reads never grant permission to overwrite or remove an unread draft. */
export class DraftStore<T> {
  private loaded = false;
  /** The value this store knows storage already holds exactly, so an identical flush is not rewritten. */
  private synced: { value: T | null } | null = null;
  private readonly owner: ReturnType<typeof createDraftStorageOwner>;
  constructor(
    private readonly storage: Storage,
    readonly key: string,
    private readonly decode: (raw: string) => T,
    private readonly encode: (value: T | null) => string | null,
  ) {
    this.owner = createDraftStorageOwner(storage, key);
  }
  get ready() {
    return this.loaded && this.owner.current();
  }
  get retired() { return !this.owner.current(); }
  async load(): Promise<T | null> {
    this.loaded = false;
    this.synced = null;
    // Decode and encode once: presence, the returned value and the sync mark share this one pass.
    const loaded = await this.owner.run(async () => {
      const raw = await this.storage.getItem(this.key);
      if (!this.owner.current()) return null;
      const value = raw === null ? null : this.decode(raw);
      const encoded = value === null ? null : this.encode(value);
      publishDraftPresence(this.storage, this.key, encoded !== null);
      return { value, synced: raw === null || encoded === raw };
    });
    if (!loaded || this.retired) throw new RetiredDraftError();
    // Only an exact round trip may skip a later flush; a stale or empty entry must still be rewritten or removed.
    this.synced = loaded.synced ? { value: loaded.value } : null;
    this.loaded = true;
    return loaded.value;
  }
  persist(value: T | null): Promise<void> {
    if (this.retired) return Promise.reject(new RetiredDraftError());
    if (!this.loaded)
      return Promise.reject(new Error("Read the saved draft successfully before changing it."));
    return this.owner.run(async () => {
      // Checked when the write runs, after earlier queued writes: only this store's own successful write sets the mark.
      if (this.synced && Object.is(this.synced.value, value)) return;
      const raw = this.encode(value);
      try {
        if (raw === null) await this.storage.removeItem(this.key);
        else await this.storage.setItem(this.key, raw);
      } catch (cause) {
        throw new DraftWriteError(cause);
      }
      this.synced = { value };
      if (this.owner.current()) publishDraftPresence(this.storage, this.key, raw !== null);
    });
  }
}

/** Flush edits made while an earlier write is pending before allowing navigation. */
export async function flushLatestDraft<T>(
  store: DraftStore<T>,
  current: () => T | null,
  saved?: (value: T | null) => void,
): Promise<void> {
  for (;;) {
    if (store.retired) throw new RetiredDraftError();
    const value = current();
    await store.persist(value);
    saved?.(value);
    if (Object.is(value, current())) return;
  }
}

/**
 * `expected` is the exact computer content the edit started from; `files.write` compares it verbatim,
 * so the baseline itself (not a hash) must survive in storage. Treat values as immutable.
 */
export type FileDraft = { expected: string; content: string };

const draftFailure = () => new Error("Saved file draft could not be loaded.");
const isOffset = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Reads the original `{expected, content}` record and the compact record, where the edit is stored
 * as the part of `content` between a shared prefix and suffix of `expected`.
 */
export function parseFileDraft(raw: string): FileDraft {
  const value = JSON.parse(raw) as Record<string, unknown> | null;
  if (!value || typeof value !== "object" || typeof value.expected !== "string") throw draftFailure();
  const { expected } = value;
  if (typeof value.content === "string") return { expected, content: value.content };
  const { prefix, suffix, insert } = value;
  if (!isOffset(prefix) || !isOffset(suffix) || typeof insert !== "string" || prefix + suffix > expected.length)
    throw draftFailure();
  return { expected, content: expected.slice(0, prefix) + insert + expected.slice(expected.length - suffix) };
}

const encodedDrafts = new WeakMap<FileDraft, string | null>();
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Null for a clean draft; otherwise the baseline once plus only the changed middle of the content.
 * Memoized per draft object, so load, flush and `isStored` checks serialize a file at most once.
 */
export function encodeFileDraft(value: FileDraft | null): string | null {
  if (!value) return null;
  const cached = encodedDrafts.get(value);
  if (cached !== undefined) return cached;
  const { expected, content } = value;
  let raw: string | null = null;
  if (content !== expected) {
    const limit = Math.min(expected.length, content.length);
    let prefix = 0;
    while (prefix < limit && expected.charCodeAt(prefix) === content.charCodeAt(prefix)) prefix++;
    // Never cut inside a surrogate pair, so stored text stays well-formed.
    if (prefix > 0 && prefix < limit && isHighSurrogate(expected.charCodeAt(prefix - 1))) prefix--;
    let suffix = 0;
    while (
      suffix < limit - prefix &&
      expected.charCodeAt(expected.length - 1 - suffix) === content.charCodeAt(content.length - 1 - suffix)
    )
      suffix++;
    if (suffix > 0 && isLowSurrogate(expected.charCodeAt(expected.length - suffix))) suffix--;
    raw = `{"expected":${JSON.stringify(expected)},"prefix":${prefix},"suffix":${suffix},"insert":${JSON.stringify(
      content.slice(prefix, content.length - suffix),
    )}}`;
  }
  encodedDrafts.set(value, raw);
  return raw;
}

/** Navigation may claim a draft is retained only after its write has succeeded. */
export async function retainDraftThenLeave<T>(
  store: DraftStore<T>,
  value: T | null,
  leave: () => void,
) {
  await store.persist(value);
  leave();
}
