import { createDraftStorageOwner, publishDraftPresence, RetiredDraftError } from "@/state/local-draft-storage";

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
    const raw = await this.owner.run(() => this.storage.getItem(this.key).then(raw => {
      if (this.owner.current()) publishDraftPresence(this.storage, this.key, raw !== null && this.encode(this.decode(raw)) !== null);
      return raw;
    }));
    if (this.retired) throw new RetiredDraftError();
    const value = raw === null ? null : this.decode(raw);
    this.loaded = true;
    return value;
  }
  persist(value: T | null): Promise<void> {
    if (this.retired) return Promise.reject(new RetiredDraftError());
    if (!this.loaded)
      return Promise.reject(new Error("Read the saved draft successfully before changing it."));
    const raw = this.encode(value);
    return this.owner.run(async () => {
      if (raw === null) await this.storage.removeItem(this.key);
      else await this.storage.setItem(this.key, raw);
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

export type FileDraft = { expected: string; content: string };
export function parseFileDraft(raw: string): FileDraft {
  const value = JSON.parse(raw) as { expected?: unknown; content?: unknown };
  if (typeof value.expected !== "string" || typeof value.content !== "string")
    throw new Error("Saved file draft could not be loaded.");
  return { expected: value.expected, content: value.content };
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
