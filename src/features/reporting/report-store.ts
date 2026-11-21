import { create } from "zustand";
import { emptyReportDraft, limitReportText, maxReportDescription, maxReportExcerpt,
  reportDraftError, type ReportDraft, type ReportError } from "./report-model";
import { reportPayload, type ReportSender } from "./report-delivery";

type ReportState = {
  draft: ReportDraft;
  revision: number;
  status: "idle" | "sending" | "sent";
  error: ReportError | null;
  requestId: string | null;
  receiptId: string | null;
};
// Private report drafts remain in memory; do not persist transcripts in ordinary storage.
export const useContentReport = create<ReportState>(() => ({
  draft: emptyReportDraft(), revision: 0, status: "idle", error: null, requestId: null, receiptId: null,
}));
let generation = 0;

export function startContentReport(excerpt: string) {
  const current = useContentReport.getState();
  if (current.status === "sending" || current.draft.description.trim() || current.draft.includeExcerpt) return;
  generation++;
  useContentReport.setState({
    draft: { ...current.draft, excerpt: limitReportText(excerpt, maxReportExcerpt), includeExcerpt: false, consent: false },
    revision: generation, status: "idle", error: null, requestId: null, receiptId: null,
  });
}

export function updateContentReport(patch: Partial<ReportDraft>) {
  const current = useContentReport.getState();
  if (current.status === "sending") return;
  const draft = { ...current.draft, ...patch };
  if (patch.consent === undefined) draft.consent = false;
  draft.description = limitReportText(draft.description, maxReportDescription);
  draft.excerpt = limitReportText(draft.excerpt, maxReportExcerpt);
  const changed = draft.reason !== current.draft.reason || draft.description !== current.draft.description ||
    draft.excerpt !== current.draft.excerpt || draft.includeExcerpt !== current.draft.includeExcerpt;
  useContentReport.setState({
    draft, revision: ++generation, status: changed ? "idle" : current.status, error: null,
    requestId: changed ? null : current.requestId, receiptId: changed ? null : current.receiptId,
  });
}

export function discardContentReport() {
  generation++;
  useContentReport.setState({ draft: emptyReportDraft(), revision: generation, status: "idle", error: null, requestId: null, receiptId: null });
}

export type ReportReview = Pick<ReportState, "draft" | "status" | "requestId" | "receiptId" | "revision">;

export function isContentReportReviewCurrent(review: ReportReview): boolean {
  const current = useContentReport.getState();
  return current.revision === review.revision && current.status !== "sending" && current.status === review.status && current.draft === review.draft &&
    current.requestId === review.requestId && current.receiptId === review.receiptId;
}

/** Synchronous comparison and discard preserve newer drafts and in-flight delivery. */
export function discardReviewedContentReport(review: ReportReview): boolean {
  if (!isContentReportReviewCurrent(review)) return false;
  discardContentReport();
  return true;
}

/** Manual retries reuse the same id; only a matching server receipt establishes delivery. */
export async function sendContentReport(options: {
  sender: ReportSender | null;
  review?: ReportReview;
  newRequestId: () => string;
  assertAccess: () => void;
}) {
  const current = useContentReport.getState();
  if (current.status === "sending" || current.status === "sent") return;
  if (options.review && !isContentReportReviewCurrent(options.review)) return;
  options.assertAccess();
  const invalid = reportDraftError(current.draft);
  if (invalid) { useContentReport.setState({ error: invalid }); return; }
  if (!options.sender) { useContentReport.setState({ error: "service" }); return; }
  const payload = reportPayload(current.draft);
  const requestId = current.requestId ?? options.newRequestId();
  const attempt = ++generation;
  useContentReport.setState({ status: "sending", error: null, requestId, revision: attempt });
  try {
    options.assertAccess();
    const receipt = await options.sender(requestId, payload);
    if (attempt !== generation) return;
    options.assertAccess();
    if (receipt.requestId !== requestId || !receipt.reportId) throw new Error("Invalid report receipt");
    useContentReport.setState({ draft: emptyReportDraft(), status: "sent", receiptId: receipt.reportId });
  } catch {
    if (attempt !== generation) return;
    try {
      options.assertAccess();
      useContentReport.setState({ status: "idle", error: "send" });
    } catch {
      // A late result never unlocks the UI or clears its private draft.
      useContentReport.setState({ status: "idle", error: null });
    }
  }
}
