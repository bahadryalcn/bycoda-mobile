import { create } from "zustand";
import { EMPTY_FEEDBACK_DRAFT, type FeedbackDraft, type FeedbackSubmitResult } from "./feedback-model";

/**
 * The unsent feedback draft survives closing the screen and a failed or rate-limited send for as
 * long as the app runs.
 * shortcut: in memory only, not persisted across launches; add the draft-storage owner if users ask.
 */
export const useFeedbackDraft = create<{
  draft: FeedbackDraft;
  /** Whether the user touched "Attach diagnostic logs"; until then it follows the sharing mode. */
  attachTouched: boolean;
  pending: FeedbackDraft | null;
  result: FeedbackSubmitResult | null;
  patch(change: Partial<FeedbackDraft>): void;
  clear(): void;
  beginDelivery(submitted: FeedbackDraft): boolean;
  finishDelivery(submitted: FeedbackDraft, result: FeedbackSubmitResult): boolean;
}>((set, get) => ({
  draft: EMPTY_FEEDBACK_DRAFT,
  attachTouched: false,
  pending: null,
  result: null,
  patch: (change) =>
    set((state) => ({
      draft: { ...state.draft, ...change },
      attachTouched: state.attachTouched || change.attachLogs !== undefined,
      result: null,
    })),
  clear: () => set({ draft: EMPTY_FEEDBACK_DRAFT, attachTouched: false, result: null }),
  beginDelivery: (submitted) => {
    const { draft, pending } = get();
    if (pending || draft !== submitted) return false;
    set({ pending: submitted });
    return true;
  },
  finishDelivery: (submitted, result) => {
    const { draft, pending } = get();
    if (pending !== submitted) return false;
    if (draft !== submitted) {
      set({ pending: null });
      return false;
    }
    set(result.status === "sent"
      ? { draft: EMPTY_FEEDBACK_DRAFT, attachTouched: false, pending: null, result }
      : { pending: null, result });
    return true;
  },
}));
