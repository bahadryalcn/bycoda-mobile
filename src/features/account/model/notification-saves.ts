import type { NotificationSettings } from "../contracts";

/** One saved control: `read` gives its value, `write` returns the settings with that value applied. */
export type SaveControl<T> = {
  id: string;
  read: (settings: NotificationSettings) => T;
  write: (settings: NotificationSettings, value: T) => NotificationSettings;
};

/** Sends the full settings object to the server and resolves with the saved copy. */
export type PutSettings = (body: NotificationSettings) => Promise<NotificationSettings>;

export type SaveStore = {
  /** Settings currently shown on screen (optimistic). */
  current: () => NotificationSettings | undefined;
  /** Replaces the settings shown on screen. */
  show: (settings: NotificationSettings) => void;
  /** A control's request started (+1) or finished (-1). */
  track: (id: string, delta: 1 | -1) => void;
  /** Marks a control failed with the action that retries it, or clears the mark (null). */
  mark: (id: string, retry: (() => void) | null) => void;
};

/**
 * Optimistic per-control saves. A change is shown at once and queued. Each request is the last
 * server-confirmed settings plus that one change, so a failed control reverts without undoing
 * another control, and no later request re-sends a value that failed. Requests run one after
 * another so the server applies them in tap order.
 */
export function createNotificationSaves(store: SaveStore) {
  let confirmed: NotificationSettings | null = null;
  let tail: Promise<void> = Promise.resolve();
  let open = 0;

  /** Server-confirmed copy, or the cached one when the screen remounted before a fetch ran. */
  const baseline = () => confirmed ?? store.current();

  async function send<T>(control: SaveControl<T>, value: T, put: PutSettings): Promise<void> {
    try {
      const base = baseline();
      if (!base) throw new Error("Notification settings are not loaded");
      const saved = await put(control.write(base, value));
      confirmed = saved;
      store.mark(control.id, null);
    } catch {
      const base = baseline();
      const now = store.current();
      if (base && now) store.show(control.write(now, control.read(base)));
      store.mark(control.id, () => save(control, value, put));
    } finally {
      store.track(control.id, -1);
      open -= 1;
      if (open === 0 && confirmed) store.show(confirmed);
    }
  }

  /** `put` is the client captured when the change was made, so a response never lands on another account. */
  function save<T>(control: SaveControl<T>, value: T, put: PutSettings): void {
    const before = store.current();
    if (!before) return;
    store.show(control.write(before, value));
    store.mark(control.id, null);
    store.track(control.id, 1);
    open += 1;
    tail = tail.then(() => send(control, value, put));
  }

  return {
    /** Records the server copy that later requests are built from. */
    adopt: (settings: NotificationSettings) => {
      confirmed = settings;
    },
    save,
  };
}
