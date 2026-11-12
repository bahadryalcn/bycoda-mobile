import {
  AccountApiError,
  FeedbackCreate,
  type AccountClient,
  type FeedbackContext,
} from "../account/contracts";
import type { DiagnosticSendResult } from "./diagnostic-report";

export const FEEDBACK_KINDS = ["idea", "problem", "praise", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
/** Limit of the contract (`FeedbackCreate`). */
export const FEEDBACK_MESSAGE_MAX = 2000;

export type FeedbackDraft = {
  kind: FeedbackKind;
  message: string;
  /** 1 to 5, or null when the user gave none. */
  rating: number | null;
  /** "Include app version and system"; off by default. */
  includeContext: boolean;
  /** "Attach diagnostic logs"; the screen starts it ticked only in automatic mode. */
  attachLogs: boolean;
};
export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  kind: "idea",
  message: "",
  rating: null,
  includeContext: false,
  attachLogs: false,
};

export type FeedbackDraftIssue = "message-missing" | "message-long";

export function validateFeedbackDraft(draft: FeedbackDraft): FeedbackDraftIssue[] {
  const length = draft.message.trim().length;
  if (length === 0) return ["message-missing"];
  if (length > FEEDBACK_MESSAGE_MAX) return ["message-long"];
  return [];
}

export type FeedbackSubmitResult =
  | { status: "sent"; reference: string; /** Linked log upload; never changes `sent`. */ logs?: DiagnosticSendResult }
  | { status: "invalid"; issues: FeedbackDraftIssue[] }
  | { status: "rate-limited" }
  | { status: "not-configured" }
  | { status: "failed" };

export type FeedbackDeps = {
  /** Only asked for when the user ticked "Include app version and system". */
  context: () => FeedbackContext;
  /** Called only after the feedback was received. */
  sendLogs?: (link: { feedbackId: string; note: string }) => Promise<DiagnosticSendResult>;
};

/**
 * Sends the user's words, the optional rating and, only when ticked, version/system context.
 * Signed-in users use the account route, guests the anonymous one. Every result other than
 * `sent` leaves the draft with the caller.
 */
export async function submitFeedback(
  api: Pick<AccountClient, "sendFeedback" | "sendAnonymousFeedback"> | null,
  draft: FeedbackDraft,
  signedIn: boolean,
  deps: FeedbackDeps,
): Promise<FeedbackSubmitResult> {
  const issues = validateFeedbackDraft(draft);
  if (issues.length > 0) return { status: "invalid", issues };
  if (!api) return { status: "not-configured" };
  try {
    const body = FeedbackCreate.safeParse({
      kind: draft.kind,
      message: draft.message,
      ...(draft.rating !== null ? { rating: draft.rating } : {}),
      ...(draft.includeContext ? { context: deps.context() } : {}),
    });
    if (!body.success) return { status: "failed" };
    const receipt = signedIn
      ? await api.sendFeedback({ body: body.data })
      : await api.sendAnonymousFeedback({ body: body.data });
    if (!draft.attachLogs || !deps.sendLogs) return { status: "sent", reference: receipt.id };
    let logs: DiagnosticSendResult;
    try {
      logs = await deps.sendLogs({ feedbackId: receipt.id, note: draft.message.trim() });
    } catch {
      logs = "failed"; // The feedback itself arrived.
    }
    return { status: "sent", reference: receipt.id, logs };
  } catch (error) {
    return error instanceof AccountApiError && (error.code === "rate_limited" || error.status === 429)
      ? { status: "rate-limited" }
      : { status: "failed" };
  }
}
