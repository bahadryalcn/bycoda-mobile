import { isSessionGoal, type SessionGoal } from "../../../../src/shared/model/providerGoal";
import { formatDuration } from "@/features/management/shared/duration";
import type { ActivityState, AgentCounts } from "./session-activity-model";

/** The composer's queue as one cluster segment: "2 sırada", or an error that opens the queue sheet. */
export type QueueSummary = {
  /** Visible words, e.g. "2 queued · Paused". */
  text: string;
  /** Spoken label with the queue's full state. */
  label: string;
  danger: boolean;
  open: () => void;
};

/** What the run segment says; plain working carries the turn clock. */
export type ClusterStatus = Exclude<ActivityState, "idle"> | "stopping";

export type ClusterSegments = {
  status?: ClusterStatus;
  goal?: SessionGoal;
  agents?: AgentCounts;
  queue?: QueueSummary;
  /** The circular "back to latest" button above the capsule. */
  jump: boolean;
};

/**
 * The session's provider-authored goal (Codex `/goal`), only for the native thread on screen, as
 * desktop shows it. A finished goal is history: the capsule stays for work that is still going on.
 */
export function activeSessionGoal(
  session: { harness?: string; providerSessionId?: string; providerGoal?: unknown } | undefined,
): SessionGoal | undefined {
  const goal = session?.providerGoal;
  if (!isSessionGoal(goal) || goal.provider !== session?.harness || goal.providerSessionId !== session.providerSessionId)
    return undefined;
  return goal.status === "complete" ? undefined : goal;
}

/**
 * Which segments the floating cluster shows. The transcript's live row owns the turn
 * clock whenever it is rendered, so one timer is ever visible and scrolling never makes the capsule
 * appear or vanish; the capsule says Working or Stopping only when no live row is rendered. States
 * the live row does not say (waiting on agents, needs you, background, done) always show here.
 */
export function clusterSegments(input: {
  activity: ActivityState;
  live: boolean;
  stopping: boolean;
  /** The transcript renders its live row (or a notice that stands in for it). */
  liveRowShown: boolean;
  goal?: SessionGoal;
  agents?: AgentCounts;
  queue?: QueueSummary | null;
  following: boolean;
  hasContent: boolean;
}): ClusterSegments {
  const status: ClusterStatus | undefined =
    input.live && input.stopping
      ? input.liveRowShown ? undefined : "stopping"
      : input.activity === "working"
        ? input.liveRowShown ? undefined : "working"
        : input.activity === "idle" ? undefined : input.activity;
  return {
    status,
    goal: input.goal,
    agents: input.agents,
    queue: input.queue ?? undefined,
    jump: !input.following && input.hasContent,
  };
}

export const hasCapsule = (segments: ClusterSegments) =>
  !!(segments.status || segments.goal || segments.agents || segments.queue);

/**
 * The transcript's bottom padding and the band its floating chrome covers, in dp from the list's
 * bottom edge. Only the capsule reserves room: the "back to latest" button floats over content the
 * reader has scrolled away from, so a drag never grows the padding. While a run is live or has just
 * finished the band stays at the capsule's size even with no capsule on screen, so the run segment
 * appearing, "Done" or a waiting state never moves the end of the list. The tablet quick-panel
 * button sits beside the capsule on the same baseline, so the taller of the two counts, not the sum.
 */
export function transcriptBottomSpace(input: {
  /** Last measured capsule height; 0 before the first layout. */
  capsuleHeight: number;
  capsuleShown: boolean;
  /** A run is live or just finished. */
  reserve: boolean;
  /** Capsule height before it is measured (one row). */
  minCapsule: number;
  /** The capsule's distance above the list's bottom edge, and the gap kept above it. */
  gap: number;
  /** The soft fade above the composer; the least padding. */
  edgeFade: number;
  quickPanelClearance: number;
}): { padding: number; clearance: number } {
  const band = input.capsuleShown || input.reserve ? Math.max(input.capsuleHeight, input.minCapsule) + input.gap : 0;
  return {
    padding: Math.max(input.edgeFade, band ? band + input.gap : 0, input.quickPanelClearance),
    clearance: Math.max(band, input.quickPanelClearance),
  };
}

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** Desktop's goal state words ("Pursuing goal", "Goal paused", …). */
export function goalStatusLabel(goal: SessionGoal, copy: Copy): string {
  switch (goal.status) {
    case "active": return copy("Hedef üzerinde çalışılıyor", "Pursuing goal");
    case "paused": return copy("Hedef duraklatıldı", "Goal paused");
    case "blocked": return copy("Hedef engellendi", "Goal blocked");
    case "usageLimited": return copy("Hedef kullanım sınırına ulaştı", "Goal hit a usage limit");
    case "budgetLimited": return copy("Hedef token bütçesine ulaştı", "Goal reached its token budget");
    case "complete": return copy("Hedef tamamlandı", "Goal complete");
  }
}

/** The goal segment: its state plus the provider-reported time spent, from one minute on. */
export function goalSegmentText(goal: SessionGoal, copy: Copy): string {
  const status = goalStatusLabel(goal, copy);
  const seconds = goal.timeUsedSeconds;
  return seconds !== undefined && seconds >= 60 ? `${status} · ${formatDuration(seconds * 1000, copy)}` : status;
}
