import type { SessionListDensity } from "../navigation-prefs/app-preferences";
import { metrics } from "@/ui/tokens";

export type { SessionListDensity };

/** What one session row shows at a density; the row renders exactly this, nothing else decides. */
export type SessionRowLayout = {
  minHeight: number;
  providerIconSize: number;
  /** `undefined` lets the title wrap freely (large text). */
  titleLines: number | undefined;
  /** The badge or age shares the title line; at large text it moves below the title. */
  stampInline: boolean;
  /** Project and branch line. */
  meta: boolean;
  /** Meta values wrap instead of ending in an ellipsis. */
  wrapMeta: boolean;
  model: boolean;
  workItem: boolean;
  managed: boolean;
  /** "Wakes at" line of a snoozed session. */
  snooze: boolean;
};

/**
 * Compact is a 48dp line (title, unread and pin marks, badge or age); standard is the usual row
 * with project and branch, the linked work item and the managed mark; detailed adds the model
 * and lets the meta wrap. With large text every density wraps instead of truncating.
 */
export function sessionRowLayout(density: SessionListDensity, largeText: boolean): SessionRowLayout {
  const compact = density === "compact";
  const detailed = density === "detailed";
  return {
    minHeight: compact ? metrics.touchTarget : metrics.rowHeightSession,
    providerIconSize: compact ? 16 : 20,
    titleLines: largeText ? undefined : compact ? 1 : 2,
    stampInline: !largeText,
    meta: !compact,
    wrapMeta: largeText || detailed,
    model: detailed,
    // The linked work item and the assistant-managed mark are identity, not detail.
    workItem: !compact,
    managed: !compact,
    // Wake time is the state of a snoozed row, so only compact leaves it to the Snoozed shelf.
    snooze: !compact,
  };
}
