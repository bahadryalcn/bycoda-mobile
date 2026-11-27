import type { LocalNoteDraft } from "../note-drafts";
import { noteTags } from "./note-tags";

/** Edits settle for this long before the note is written to the computer. */
export const NOTE_AUTOSAVE_DELAY_MS = 1000;

export type NoteAutosaveState =
  | { status: "idle" | "pending" | "saving" | "saved" }
  | { status: "error"; error: unknown };

export type NoteAutosaveWrite = (
  params: {
    note: { id: string; title: string; body: string; tags: string[]; sourceCwd?: string; finalizeSlug?: true };
    expectedUpdatedAt: number;
  },
) => Promise<{ updatedAt: number }>;

/** Same saved content; the conflict base is not part of it. */
export const sameNoteContent = (a: LocalNoteDraft, b: LocalNoteDraft) =>
  a.title === b.title && a.body === b.body && a.tags === b.tags && a.sourceCwd === b.sourceCwd;

const isBlank = (draft: LocalNoteDraft) => !draft.title.trim() && !draft.body.trim() && !noteTags(draft.tags).length;

/**
 * Background saving for one open note, matching the desktop editor: at most one
 * write is in flight, newer edits wait behind it, and each success becomes the
 * conflict base of the next write. A failure keeps the edit for a retry or the
 * next change; nothing is dropped silently. A new note is not created until it
 * has content.
 */
export function createNoteAutosave({
  initial,
  baseline = initial,
  write,
  notify,
  onSaved,
  delayMs = NOTE_AUTOSAVE_DELAY_MS,
}: {
  initial: LocalNoteDraft;
  /** What the computer holds; a recovered phone draft differs from it until saved. */
  baseline?: LocalNoteDraft;
  write: NoteAutosaveWrite;
  notify: (state: NoteAutosaveState) => void;
  onSaved?: (saved: LocalNoteDraft, updatedAt: number) => void;
  delayMs?: number;
}) {
  let expected = initial.expectedUpdatedAt;
  let saved: LocalNoteDraft = baseline;
  let latest: { draft: LocalNoteDraft; finalize: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let stopped = false;
  // One committed-title write is enough; later ones would only repeat it.
  let finalized = false;
  // Quiet until this editor writes something; opening a note is not a save.
  let state: NoteAutosaveState = { status: "idle" };
  const publish = (next: NoteAutosaveState) => {
    if (state.status === next.status && !("error" in next)) return;
    state = next;
    notify(next);
  };
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const drain = async () => {
    while (latest && !stopped) {
      const { draft, finalize } = latest;
      latest = null;
      if (sameNoteContent(draft, saved) && (!finalize || finalized || expected === 0)) continue;
      if (expected === 0 && isBlank(draft)) continue;
      publish({ status: "saving" });
      try {
        const note = await write({
          note: {
            id: draft.id,
            title: draft.title,
            body: draft.body,
            tags: noteTags(draft.tags),
            ...(draft.sourceCwd ? { sourceCwd: draft.sourceCwd } : {}),
            ...(finalize ? { finalizeSlug: true as const } : {}),
          },
          expectedUpdatedAt: expected,
        });
        expected = note.updatedAt;
        saved = draft;
        if (finalize) finalized = true;
        onSaved?.(draft, note.updatedAt);
      } catch (error) {
        // A newer edit made during the failed write wins; otherwise keep this one for retry.
        latest ??= { draft, finalize };
        publish({ status: "error", error });
        throw error;
      }
    }
    if (!stopped) publish({ status: expected > 0 ? "saved" : "idle" });
  };
  const flush = (): Promise<void> => {
    stopTimer();
    if (running) return running.then(() => (latest ? flush() : undefined));
    if (!latest || stopped) return Promise.resolve();
    const job = drain().finally(() => {
      if (running === job) running = null;
    });
    running = job;
    return job;
  };
  return {
    /**
     * Records the newest draft. `hold` keeps it without starting the timer (a new
     * note's title is still being typed); `finalize` marks the title as committed
     * so the computer can derive the note's lasting link name from it.
     */
    schedule(draft: LocalNoteDraft, options: { hold?: boolean; finalize?: boolean } = {}) {
      if (stopped) return;
      stopTimer();
      if (!running && sameNoteContent(draft, saved) && (!options.finalize || finalized || expected === 0)) {
        // Back to what the computer has: nothing to write and no failure left to report.
        latest = null;
        publish({ status: expected > 0 ? "saved" : "idle" });
        return;
      }
      latest = { draft, finalize: !!options.finalize };
      if (!running) publish({ status: "pending" });
      if (options.hold) return;
      timer = setTimeout(() => {
        // The failure is already published as state; the timer has no caller to report to.
        void flush().catch(() => {});
      }, delayMs);
    },
    /** Writes the newest draft now; also the retry path after an error. */
    flush,
    /** Stops writing (before a delete) and drops waiting edits; resolves once no write is in flight. */
    pause(): Promise<void> {
      stopped = true;
      latest = null;
      stopTimer();
      return running ? running.catch(() => {}) : Promise.resolve();
    },
    /** Writes again after a paused delete failed. */
    resume() {
      stopped = false;
    },
    /** The revision the next write or a delete must match. */
    get expectedUpdatedAt() {
      return expected;
    },
    /** True while some edit has not reached the computer. */
    get unsaved() {
      return latest !== null || running !== null;
    },
  };
}
export type NoteAutosave = ReturnType<typeof createNoteAutosave>;
