export const reportReasons = ["unsafe", "hate", "sexual", "privacy", "other"] as const;
export type ReportReason = (typeof reportReasons)[number];
export const maxReportDescription = 2000;
export const maxReportExcerpt = 4000;

export type ReportDraft = {
  reason: ReportReason;
  description: string;
  excerpt: string;
  includeExcerpt: boolean;
  consent: boolean;
};
export type ReportError = "description" | "consent" | "service" | "send";

export const emptyReportDraft = (): ReportDraft => ({
  reason: "other",
  description: "",
  excerpt: "",
  includeExcerpt: false,
  consent: false,
});

export function limitReportText(value: string, limit: number) {
  return Array.from(value).slice(0, limit).join("");
}

export function reportDraftError(draft: ReportDraft): ReportError | null {
  if (
    !reportReasons.includes(draft.reason) ||
    !draft.description.trim() ||
    Array.from(draft.description).length > maxReportDescription ||
    (draft.includeExcerpt && Array.from(draft.excerpt).length > maxReportExcerpt)
  )
    return "description";
  if (!draft.consent) return "consent";
  return null;
}
