type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Navigation creates a new store while the outgoing editor can still be flushing.
// Share pending writes by storage/key so its replacement cannot read stale data.
const storageWrites = new WeakMap<Storage, Map<string, Promise<void>>>();

/** Failed reads never grant permission to overwrite or remove an unread draft. */
export class DraftStore<T> {
  private loaded = false;
  private readonly writes: Map<string, Promise<void>>;
  constructor(
    private readonly storage: Storage,
    readonly key: string,
    private readonly decode: (raw: string) => T,
    private readonly encode: (value: T | null) => string | null,
  ) {
    let writes = storageWrites.get(storage);
    if (!writes) {
      writes = new Map();
      storageWrites.set(storage, writes);
    }
    this.writes = writes;
  }
  get ready() {
    return this.loaded;
  }
  async load(): Promise<T | null> {
    this.loaded = false;
    await this.writes.get(this.key)?.catch(() => undefined);
    const raw = await this.storage.getItem(this.key);
    const value = raw === null ? null : this.decode(raw);
    this.loaded = true;
    return value;
  }
  persist(value: T | null): Promise<void> {
    if (!this.loaded)
      return Promise.reject(new Error("Read the saved draft successfully before changing it."));
    const raw = this.encode(value);
    const write = (this.writes.get(this.key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() =>
        raw === null ? this.storage.removeItem(this.key) : this.storage.setItem(this.key, raw),
      );
    this.writes.set(this.key, write);
    const settled = () => {
      if (this.writes.get(this.key) === write) this.writes.delete(this.key);
    };
    void write.then(settled, settled);
    return write;
  }
}

/** Flush edits made while an earlier write is pending before allowing navigation. */
export async function flushLatestDraft<T>(
  store: DraftStore<T>,
  current: () => T | null,
  saved?: (value: T | null) => void,
): Promise<void> {
  for (;;) {
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
