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
    ready: copy("İncelemeye hazır olarak işaretle", "Mark ready for review"),
    close: copy("Pull request’i kapat", "Close pull request"),
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
    // GitHub review states, GitLab merge request and Azure DevOps pull request states.
    COMMENTED: copy("Yorum yaptı", "Commented"),
    DISMISSED: copy("Reddedildi", "Dismissed"),
    PENDING: copy("Bekliyor", "Pending"),
    OPENED: copy("Açık", "Open"),
    ACTIVE: copy("Açık", "Open"),
    COMPLETED: copy("Birleştirildi", "Merged"),
    ABANDONED: copy("Kapalı", "Closed"),
    LOCKED: copy("Kilitli", "Locked"),
  };
  return labels[state.toUpperCase()] ?? humanizeState(state);
}

/** Jira and other providers send workflow names as written ("DEVELOPMENT IN PROGRESS"); show them in sentence case. */
export function humanizeState(state: string) {
  const text = state.replace(/_/g, " ").trim();
  // Mixed case is written by a person ("In Review"); keep it. All caps and all lower case read as sentence case.
  if (!text || (text !== text.toUpperCase() && text !== text.toLowerCase())) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Tone for a provider workflow state; unknown states stay neutral. */
export function providerStateTone(state: string): "default" | "success" | "warning" | "danger" | "active" {
  const tones: Record<string, "success" | "warning" | "danger" | "active"> = {
    OPEN: "success", OPENED: "success", ACTIVE: "success", APPROVED: "success", MERGED: "active", COMPLETED: "active",
    CHANGES_REQUESTED: "danger", REVIEW_REQUIRED: "warning",
  };
  return tones[state.toUpperCase()] ?? "default";
}
