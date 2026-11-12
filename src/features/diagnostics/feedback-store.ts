import { create } from "zustand";
import { EMPTY_FEEDBACK_DRAFT, type FeedbackDraft } from "./feedback-model";

/**
 * The unsent feedback draft survives closing the screen and a failed or rate-limited send for as
 * long as the app runs.
 * shortcut: in memory only, not persisted across launches; add the draft-storage owner if users ask.
 */
export const useFeedbackDraft = create<{
  draft: FeedbackDraft;
  /** Whether the user touched "Attach diagnostic logs"; until then it follows the sharing mode. */
  attachTouched: boolean;
  patch(change: Partial<FeedbackDraft>): void;
  clear(): void;
}>((set) => ({
  draft: EMPTY_FEEDBACK_DRAFT,
  attachTouched: false,
  patch: (change) =>
    set((state) => ({
      draft: { ...state.draft, ...change },
      attachTouched: state.attachTouched || change.attachLogs !== undefined,
    })),
  clear: () => set({ draft: EMPTY_FEEDBACK_DRAFT, attachTouched: false }),
}));
