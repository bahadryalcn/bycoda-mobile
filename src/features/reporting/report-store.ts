import { create } from "zustand";
import {
  emptyReportDraft,
  limitReportText,
  maxReportDescription,
  maxReportExcerpt,
  reportDraftError,
  reportEmailUrl,
  type ReportDraft,
  type ReportError,
} from "./report-model";

type ReportState = {
  draft: ReportDraft;
  status: "idle" | "opening" | "opened";
  error: ReportError | null;
};

// Deliberately ephemeral: backgrounding/navigation retains the form, process termination does not.
export const useContentReport = create<ReportState>(() => ({
  draft: emptyReportDraft(),
  status: "idle",
  error: null,
}));
let generation = 0;

/** Preserve a composed report if another content-report entry point is opened. */
export function startContentReport(excerpt: string) {
  const current = useContentReport.getState();
  if (
    current.status === "opening" ||
    current.draft.description.trim() ||
    current.draft.includeExcerpt
  )
    return;
  generation++;
  useContentReport.setState({
    draft: {
      ...current.draft,
      excerpt: limitReportText(excerpt, maxReportExcerpt),
      includeExcerpt: false,
      consent: false,
    },
    status: "idle",
    error: null,
  });
}

export function updateContentReport(patch: Partial<ReportDraft>) {
  const current = useContentReport.getState();
  if (current.status === "opening") return;
  const draft = { ...current.draft, ...patch };
  if (patch.consent === undefined) draft.consent = false;
  draft.description = limitReportText(draft.description, maxReportDescription);
  draft.excerpt = limitReportText(draft.excerpt, maxReportExcerpt);
  useContentReport.setState({ draft, status: "idle", error: null });
}

export function discardContentReport() {
  generation++;
  useContentReport.setState({ draft: emptyReportDraft(), status: "idle", error: null });
}

/** Opening an email composer never establishes that a report was sent or delivered. */
export async function openContentReportEmail(options: {
  recipient: string;
  turkish: boolean;
  assertAccess: () => void;
  openURL: (url: string) => Promise<unknown>;
}) {
  const current = useContentReport.getState();
  if (current.status === "opening") return;
  options.assertAccess();
  const invalid = reportDraftError(current.draft);
  if (invalid) {
    useContentReport.setState({ error: invalid });
    return;
  }
  let url: string;
  try {
    url = reportEmailUrl(current.draft, options.recipient, options.turkish);
  } catch {
    useContentReport.setState({ error: "recipient" });
    return;
  }
  const attempt = ++generation;
  useContentReport.setState({ status: "opening", error: null });
  try {
    options.assertAccess();
    await options.openURL(url);
    if (attempt !== generation) return;
    options.assertAccess();
    useContentReport.setState({ status: "opened" });
  } catch {
    if (attempt !== generation) return;
    try {
      options.assertAccess();
      useContentReport.setState({ status: "idle", error: "open" });
    } catch {
      // Opening the mail app can trigger app lock; a late result must not bypass it.
      useContentReport.setState({ status: "idle", error: null });
    }
  }
}
