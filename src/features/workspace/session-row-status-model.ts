import type { SessionRowKind } from "./session-row-state";

export type SessionRowBadgeTone = "default" | "danger" | "warning" | "info" | "success";
export type SessionRowBadgeIcon = "alert" | "working" | "waiting" | "done" | "draft";

/** Desktop `SessionRowStatus` tones and icons per status kind; `idle` shows only the time. */
export function sessionRowBadge(
  kind: SessionRowKind,
  draft: boolean,
): { tone: SessionRowBadgeTone; icon: SessionRowBadgeIcon } | undefined {
  switch (kind) {
    case "failed":
      return { tone: "danger", icon: "alert" };
    case "retrying":
    case "interrupted":
    case "input":
      return { tone: "warning", icon: "alert" };
    case "working":
      return { tone: "info", icon: "working" };
    case "waiting":
      return { tone: "default", icon: "waiting" };
    case "done":
      return { tone: "success", icon: "done" };
    case "idle":
      return draft ? { tone: "default", icon: "draft" } : undefined;
  }
}
