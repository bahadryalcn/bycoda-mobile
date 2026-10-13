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
export type ReportError = "description" | "consent" | "recipient" | "open";

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

/** Only the reviewed fields enter the email: no host, session, account or device metadata. */
export function reportEmailUrl(draft: ReportDraft, recipient: string, turkish: boolean) {
  if (!/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient))
    throw new Error("Invalid report recipient");
  if (reportDraftError(draft)) throw new Error("Review the report before composing an email");
  const reason = {
    unsafe: turkish ? "Zararlı veya tehlikeli içerik" : "Unsafe or dangerous content",
    hate: turkish ? "Nefret veya taciz" : "Hate or harassment",
    sexual: turkish ? "Cinsel içerik" : "Sexual content",
    privacy: turkish ? "Gizlilik veya kişisel veri" : "Privacy or personal data",
    other: turkish ? "Diğer" : "Other",
  }[draft.reason];
  const body = [
    `${turkish ? "Neden" : "Reason"}: ${reason}`,
    `${turkish ? "Açıklama" : "Description"}:\n${draft.description.trim()}`,
    ...(draft.includeExcerpt && draft.excerpt.trim()
      ? [
          `${turkish ? "Paylaşmayı seçtiğim içerik" : "Content I chose to share"}:\n${draft.excerpt.trim()}`,
        ]
      : []),
  ].join("\n\n");
  const subject = turkish ? "bycoda içerik bildirimi" : "bycoda content report";
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
