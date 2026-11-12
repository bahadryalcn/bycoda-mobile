type Copy = (tr: string, en: string) => string;

export function prReviewDecisionLabel(
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
  copy: Copy,
) {
  return {
    COMMENT: copy("Yorum", "Comment"),
    APPROVE: copy("Onayla", "Approve"),
    REQUEST_CHANGES: copy("Değişiklik iste", "Request changes"),
  }[event];
}

export function providerActionLabel(action: string, copy: Copy) {
  const labels: Record<string, string> = {
    draft: copy("Taslağa çevir", "Convert to draft"),
    ready: copy("İncelemeye hazır", "Ready for review"),
    close: copy("Kapat", "Close"),
    reopen: copy("Yeniden aç", "Reopen"),
    merge: copy("Birleştir", "Merge"),
    squash: copy("Tek commit ile birleştir", "Squash and merge"),
    rebase: copy("Rebase ile birleştir", "Rebase and merge"),
  };
  return labels[action] ?? action;
}

export function providerStateLabel(state: string, copy: Copy) {
  const labels: Record<string, string> = {
    OPEN: copy("Açık", "Open"),
    CLOSED: copy("Kapalı", "Closed"),
    MERGED: copy("Birleştirildi", "Merged"),
    REVIEW_REQUIRED: copy("İnceleme bekliyor", "Review required"),
    APPROVED: copy("Onaylandı", "Approved"),
    CHANGES_REQUESTED: copy("Değişiklik istendi", "Changes requested"),
  };
  return labels[state.toUpperCase()] ?? state;
}

/** Tone for a provider workflow state; unknown states stay neutral. */
export function providerStateTone(state: string): "default" | "success" | "warning" | "danger" | "active" {
  const tones: Record<string, "success" | "warning" | "danger" | "active"> = {
    OPEN: "success", APPROVED: "success", MERGED: "active", CHANGES_REQUESTED: "danger", REVIEW_REQUIRED: "warning",
  };
  return tones[state.toUpperCase()] ?? "default";
}
