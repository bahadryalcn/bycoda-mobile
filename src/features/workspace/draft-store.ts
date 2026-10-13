type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Failed reads never grant permission to overwrite or remove an unread draft. */
export class DraftStore<T> {
  private loaded = false;
  private writes = Promise.resolve();
  constructor(
    private readonly storage: Storage,
    readonly key: string,
    private readonly decode: (raw: string) => T,
    private readonly encode: (value: T | null) => string | null,
  ) {}
  get ready() {
    return this.loaded;
  }
  async load(): Promise<T | null> {
    this.loaded = false;
    await this.writes.catch(() => undefined);
    const raw = await this.storage.getItem(this.key);
    const value = raw === null ? null : this.decode(raw);
    this.loaded = true;
    return value;
  }
  persist(value: T | null): Promise<void> {
    if (!this.loaded)
      return Promise.reject(new Error("Read the saved draft successfully before changing it."));
    const raw = this.encode(value);
    this.writes = this.writes
      .catch(() => undefined)
      .then(() =>
        raw === null ? this.storage.removeItem(this.key) : this.storage.setItem(this.key, raw),
      );
    return this.writes;
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
