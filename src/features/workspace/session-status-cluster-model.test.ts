import { expect, it } from "vitest";
import {
  activeSessionGoal,
  clusterSegments,
  goalSegmentText,
  hasCapsule,
  transcriptBottomSpace,
  type QueueSummary,
} from "./session-status-cluster-model";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(\w+)\}/g, (_match, key: string) => String(values?.[key] ?? ""));
const base = {
  activity: "working" as const,
  live: true,
  stopping: false,
  liveRowShown: false,
  following: true,
  hasContent: true,
};
const counts = { total: 2, queued: 0, running: 2, done: 0, failed: 0, stopped: 0, interrupted: 0 };
const queue: QueueSummary = { text: "2 queued", label: "2 queued · Active", danger: false, open: () => {} };

it("shows the run clock only while the transcript's live row is out of sight", () => {
  expect(clusterSegments({ ...base, liveRowShown: true }).status).toBeUndefined();
  expect(clusterSegments(base).status).toBe("working");
  expect(clusterSegments({ ...base, stopping: true, liveRowShown: true }).status).toBeUndefined();
  expect(clusterSegments({ ...base, stopping: true }).status).toBe("stopping");
});

it("always carries the states the live row does not say, and nothing when idle", () => {
  for (const activity of ["waiting", "needs-input", "background"] as const)
    expect(clusterSegments({ ...base, activity, liveRowShown: true }).status).toBe(activity);
  expect(clusterSegments({ ...base, activity: "done", live: false }).status).toBe("done");
  const idle = clusterSegments({ ...base, activity: "idle", live: false });
  expect(idle.status).toBeUndefined();
  expect(hasCapsule(idle)).toBe(false);
});

it("adds goal, agents and queue segments and the jump button only when scrolled up", () => {
  const goal = { provider: "codex" as const, providerSessionId: "p", objective: "Ship", status: "active" as const };
  const segments = clusterSegments({ ...base, liveRowShown: true, goal, agents: counts, queue, following: false });
  expect(segments).toMatchObject({ goal, agents: counts, queue, jump: true });
  expect(hasCapsule(segments)).toBe(true);
  expect(clusterSegments({ ...base, following: false, hasContent: false }).jump).toBe(false);
  expect(clusterSegments({ ...base, queue: null }).queue).toBeUndefined();
});

it("accepts only the displayed thread's unfinished provider goal", () => {
  const goal = { provider: "codex", providerSessionId: "thread", objective: "Ship it", status: "active", timeUsedSeconds: 54_357 };
  const session = { harness: "codex", providerSessionId: "thread", providerGoal: goal };
  expect(activeSessionGoal(session)).toEqual(goal);
  expect(activeSessionGoal({ ...session, providerSessionId: "other" })).toBeUndefined();
  expect(activeSessionGoal({ ...session, harness: "claude" })).toBeUndefined();
  expect(activeSessionGoal({ ...session, providerGoal: { ...goal, status: "complete" } })).toBeUndefined();
  expect(activeSessionGoal({ ...session, providerGoal: { objective: "x" } })).toBeUndefined();
  expect(activeSessionGoal(undefined)).toBeUndefined();
  expect(goalSegmentText(goal as never, copy)).toBe("Pursuing goal · 15 h 5 min");
  expect(goalSegmentText({ ...goal, status: "paused", timeUsedSeconds: 30 } as never, copy)).toBe("Goal paused");
});

it("reserves only the capsule, keeps the band through a live run and maxes with the tablet button", () => {
  const at = { capsuleHeight: 48, capsuleShown: true, reserve: false, minCapsule: 48, gap: 8, edgeFade: 24, quickPanelClearance: 0 };
  expect(transcriptBottomSpace(at)).toEqual({ padding: 64, clearance: 56 });
  // No capsule and no run: only the fade; the jump button alone reserves nothing.
  expect(transcriptBottomSpace({ ...at, capsuleShown: false })).toEqual({ padding: 24, clearance: 0 });
  // A live or just-finished run keeps the same band without a capsule, before or after measuring.
  expect(transcriptBottomSpace({ ...at, capsuleShown: false, reserve: true })).toEqual({ padding: 64, clearance: 56 });
  expect(transcriptBottomSpace({ ...at, capsuleHeight: 0, reserve: true })).toEqual({ padding: 64, clearance: 56 });
  // A two-row capsule at large text reserves its measured height.
  expect(transcriptBottomSpace({ ...at, capsuleHeight: 96 }).padding).toBe(112);
  // The tablet quick-panel button sits beside the capsule: the taller one counts.
  expect(transcriptBottomSpace({ ...at, quickPanelClearance: 72 })).toEqual({ padding: 72, clearance: 72 });
  expect(transcriptBottomSpace({ ...at, capsuleShown: false, quickPanelClearance: 72 })).toEqual({ padding: 72, clearance: 72 });
});
