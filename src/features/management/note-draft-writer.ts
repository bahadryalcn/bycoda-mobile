import type { LocalNoteDraft, NoteDraftOwner } from "./note-drafts";

/** Typing bursts collapse into one full-note write after this quiet period. */
export const NOTE_DRAFT_SAVE_DELAY_MS = 500;

export type NoteDraftWriteState =
  | { status: "idle" | "pending" | "saving" | "saved" }
  | { status: "error"; error: unknown };

/**
 * Latest-wins coalescing in front of one bound owner (machine scope is fixed at creation).
 * At most one write is in flight and one newer draft waits behind it, so a slow store never
 * builds a queue. A failed write keeps its draft until a newer edit replaces it or a retry
 * succeeds; nothing is dropped silently.
 */
export function createNoteDraftWriter(
  owner: Pick<NoteDraftOwner, "save" | "clearSaved"> | null,
  notify: (state: NoteDraftWriteState) => void,
  delayMs = NOTE_DRAFT_SAVE_DELAY_MS,
) {
  let latest: LocalNoteDraft | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let state: NoteDraftWriteState = { status: "idle" };
  const publish = (next: NoteDraftWriteState) => {
    // Identical status updates are dropped so keystrokes do not re-render for nothing.
    if (state.status === next.status && !("error" in next)) return;
    state = next;
    notify(next);
  };
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const drain = async () => {
    while (latest) {
      const draft = latest;
      latest = null;
      publish({ status: "saving" });
      try {
        if (!owner) throw new Error("Choose a computer.");
        await owner.save(draft);
      } catch (error) {
        // A newer edit made during the failed write wins; otherwise keep this one for retry.
        latest ??= draft;
        publish({ status: "error", error });
        throw error;
      }
    }
    publish({ status: "saved" });
  };
  /** Writes the newest pending draft now; also the retry path after an error. */
  const flush = (): Promise<void> => {
    stopTimer();
    if (running) return running;
    if (!latest) return Promise.resolve();
    const job = drain().finally(() => {
      if (running === job) running = null;
    });
    running = job;
    return job;
  };
  return {
    schedule(draft: LocalNoteDraft) {
      latest = draft;
      // An active write picks the newest draft up when it finishes; no second timer race.
      if (!running) publish({ status: "pending" });
      stopTimer();
      timer = setTimeout(() => {
        // The failure is already published as state; the timer has no caller to report to.
        void flush().catch(() => {});
      }, delayMs);
    },
    flush,
    /**
     * Removes the local draft once the note is safe elsewhere. Pending edits are written
     * first so the stored draft equals `saved` and the matching removal cannot be skipped.
     */
    async clear(saved: LocalNoteDraft) {
      await flush();
      if (!owner) throw new Error("Choose a computer.");
      await owner.clearSaved(saved);
    },
    get hasPending() {
      return latest !== null;
    },
  };
}
export type NoteDraftWriter = ReturnType<typeof createNoteDraftWriter>;
