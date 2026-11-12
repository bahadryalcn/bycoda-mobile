import { describe, expect, it } from "vitest";

import {
  buildWidgetSnapshot,
  liveActivityProps,
  sessionUrl,
  snapshotIdentity,
  truncateLabel,
  widgetTimeline,
  type BuildSnapshotInput,
  type WidgetSessionInput,
} from "./snapshot";
import { widgetPalette } from "./palette";

const now = 1_700_000_000_000;
const labels = {
  title: "Sessions",
  running: "Running",
  needsInput: "Needs input",
  failed: "Failed",
  empty: "No active sessions",
  locked: "Open bycoda to continue",
  setup: "Open bycoda to connect",
  stale: "Open bycoda to refresh",
};

function session(id: string, overrides: Partial<WidgetSessionInput> = {}): WidgetSessionInput {
  return {
    id,
    projectId: "p1",
    projectName: "Project One",
    title: `Secret title ${id}`,
    status: "running",
    updatedAt: now - 1_000,
    ...overrides,
  };
}

function input(overrides: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    machine: { id: "machine-1", name: "Work PC" },
    unlocked: true,
    ready: true,
    sessions: [],
    showTitles: false,
    now,
    labels,
    palette: widgetPalette,
    ...overrides,
  };
}

describe("buildWidgetSnapshot", () => {
  it("counts statuses, sorts needs-input first and caps rows at five", () => {
    const sessions = [
      session("a", { updatedAt: now - 5_000 }),
      session("b", { updatedAt: now - 1_000 }),
      session("c", { needsInput: true, updatedAt: now - 9_000 }),
      session("d", { status: "interrupted" }),
      session("e", { status: "idle" }),
      session("f", { issue: "failed", status: "idle" }),
      session("g", { updatedAt: now - 100 }),
    ];
    const snapshot = buildWidgetSnapshot(input({ sessions }))!;
    expect(snapshot.counts).toEqual({ running: 3, needsInput: 1, failed: 2 });
    expect(snapshot.sessions).toHaveLength(5);
    expect(snapshot.sessions.map((row) => row.status)).toEqual([
      "needs_input",
      "failed",
      "failed",
      "running",
      "running",
    ]);
    expect(snapshot.sessions[3]!.id).toBe("g");
  });

  it("treats needsInput as waiting even while the session runs", () => {
    const snapshot = buildWidgetSnapshot(input({ sessions: [session("a", { needsInput: true })] }))!;
    expect(snapshot.counts).toEqual({ running: 0, needsInput: 1, failed: 0 });
  });

  it("skips archived sessions, delegated children and old finished work", () => {
    const old = now - 13 * 60 * 60_000;
    const snapshot = buildWidgetSnapshot(
      input({
        sessions: [
          session("a", { archived: true }),
          session("b", { child: true }),
          session("c", { status: "idle", updatedAt: old }),
          session("d", { status: "interrupted", updatedAt: old }),
          session("e", { status: "idle", updatedAt: now - 1_000 }),
        ],
      }),
    )!;
    expect(snapshot.sessions.map((row) => row.id)).toEqual(["e"]);
    expect(snapshot.counts).toEqual({ running: 0, needsInput: 0, failed: 0 });
  });

  it("never exposes titles unless enabled and only carries the allowed fields", () => {
    const hidden = buildWidgetSnapshot(input({ sessions: [session("a")] }))!;
    expect(hidden.sessions[0]!.title).toBe("");
    expect(JSON.stringify(hidden)).not.toContain("Secret title");
    const shown = buildWidgetSnapshot(input({ sessions: [session("a")], showTitles: true }))!;
    expect(shown.sessions[0]!.title).toBe("Secret title a");
    expect(Object.keys(shown.sessions[0]!).sort()).toEqual(
      ["id", "project", "status", "title", "updatedAt", "url"].sort(),
    );
  });

  it("truncates long titles and project names", () => {
    const snapshot = buildWidgetSnapshot(
      input({
        showTitles: true,
        sessions: [session("a", { title: "x".repeat(200), projectName: "p".repeat(100) })],
      }),
    )!;
    expect(Array.from(snapshot.sessions[0]!.title)).toHaveLength(60);
    expect(Array.from(snapshot.sessions[0]!.project)).toHaveLength(40);
  });

  it("builds deep links that always carry the computer id", () => {
    const snapshot = buildWidgetSnapshot(
      input({ sessions: [session("s 1", { projectId: "p/2" })] }),
    )!;
    expect(snapshot.sessions[0]!.url).toBe(
      "bycoda://session/s%201?projectId=p%2F2&machineId=machine-1",
    );
    expect(sessionUrl("m", "p", "s")).toBe("bycoda://session/s?projectId=p&machineId=m");
    expect(snapshot.url).toBe("bycoda://sessions");
  });

  it("publishes a data-free locked snapshot while the app is locked", () => {
    const snapshot = buildWidgetSnapshot(
      input({ unlocked: false, ready: false, sessions: [session("a")], showTitles: true }),
    )!;
    expect(snapshot.state).toBe("locked");
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.machineName).toBe("");
    expect(snapshot.counts).toEqual({ running: 0, needsInput: 0, failed: 0 });
  });

  it("publishes a setup snapshot without a computer and skips untrusted directories", () => {
    expect(buildWidgetSnapshot(input({ machine: null }))!.state).toBe("setup");
    expect(buildWidgetSnapshot(input({ machine: null }))!.url).toBe("bycoda://machines");
    expect(buildWidgetSnapshot(input({ ready: false, sessions: [session("a")] }))).toBeNull();
  });

  it("expires after ten minutes and ignores timing in the change identity", () => {
    const first = buildWidgetSnapshot(input({ sessions: [session("a")] }))!;
    const later = buildWidgetSnapshot(input({ sessions: [session("a")], now: now + 60_000 }))!;
    expect(first.expiresAt - first.generatedAt).toBe(10 * 60_000);
    expect(snapshotIdentity(first)).toBe(snapshotIdentity(later));
    const changed = buildWidgetSnapshot(input({ sessions: [session("a"), session("b")] }))!;
    expect(snapshotIdentity(changed)).not.toBe(snapshotIdentity(first));
  });
});

describe("widgetTimeline", () => {
  it("adds a stale entry at expiry", () => {
    const snapshot = buildWidgetSnapshot(input({ sessions: [session("a")] }))!;
    const [live, stale] = widgetTimeline(snapshot);
    expect(live!.date.getTime()).toBe(snapshot.generatedAt);
    expect(live!.props.stale).toBe(false);
    expect(stale!.date.getTime()).toBe(snapshot.expiresAt);
    expect(stale!.props.stale).toBe(true);
  });
});

describe("liveActivityProps", () => {
  it("is null when nothing runs or the app is locked", () => {
    expect(liveActivityProps(buildWidgetSnapshot(input({ sessions: [session("a", { status: "idle" })] }))!)).toBeNull();
    expect(liveActivityProps(buildWidgetSnapshot(input({ unlocked: false }))!)).toBeNull();
  });

  it("lists at most three active rows with titles redacted", () => {
    const sessions = ["a", "b", "c", "d"].map((id) => session(id));
    const props = liveActivityProps(buildWidgetSnapshot(input({ sessions }))!)!;
    expect(props.running).toBe(4);
    expect(props.rows).toHaveLength(3);
    expect(JSON.stringify(props)).not.toContain("Secret title");
    expect(props.url).toContain("machineId=machine-1");
  });
});

describe("truncateLabel", () => {
  it("collapses whitespace and never splits a surrogate pair", () => {
    expect(truncateLabel("  a \n b  ", 10)).toBe("a b");
    const out = truncateLabel("😀".repeat(5), 3);
    expect(Array.from(out)).toEqual(["😀", "😀", "…"]);
  });
});
