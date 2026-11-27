import { describe, expect, it } from "vitest";

import { attentionPublishDue, markAttentionPublished, nextPublishStep } from "./publish-gate";
import { widgetPalette } from "./palette";
import { buildWidgetSnapshot, type WidgetSessionInput } from "./snapshot";

const HEARTBEAT = 4 * 60_000;
const claimed = { identity: "A", at: 1_000 };

describe("nextPublishStep", () => {
  it("does not retire an unchanged in-flight publication on a re-run", () => {
    expect(nextPublishStep(claimed, "A", 2_000, HEARTBEAT)).toBe("skip");
  });

  it("republishes an unchanged snapshot once the heartbeat is due, without retiring", () => {
    expect(nextPublishStep(claimed, "A", 1_000 + HEARTBEAT, HEARTBEAT)).toBe("publish");
  });

  it("retires in-flight writes when the snapshot identity changes", () => {
    expect(nextPublishStep(claimed, "B", 2_000, HEARTBEAT)).toBe("retire");
  });

  it("retires when the snapshot becomes not ready", () => {
    expect(nextPublishStep(claimed, null, 2_000, HEARTBEAT)).toBe("retire");
  });

  it("skips when nothing is claimed and nothing is ready", () => {
    expect(nextPublishStep({ identity: "", at: 0 }, null, 2_000, HEARTBEAT)).toBe("skip");
  });

  it("publishes a first snapshot after a retirement cleared the claim", () => {
    expect(nextPublishStep({ identity: "", at: 0 }, "A", 2_000, HEARTBEAT)).toBe("retire");
  });

  it("does not retire when a change is reverted to the last claimed state in the same window", () => {
    // Claimed A, then B was only scheduled (never fired), then back to A: A is still the state.
    expect(nextPublishStep(claimed, "A", 1_500, HEARTBEAT)).toBe("skip");
  });
});

describe("attentionPublishDue", () => {
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
  const row = (id: string, extra: Partial<WidgetSessionInput> = {}): WidgetSessionInput => ({
    id,
    projectId: "p1",
    projectName: "Project",
    title: id,
    status: "running",
    updatedAt: now - 1_000,
    ...extra,
  });
  const snapshot = (sessions: WidgetSessionInput[], at = now) =>
    buildWidgetSnapshot({
      machine: { id: "m", name: "PC" },
      unlocked: true,
      ready: true,
      sessions,
      showTitles: true,
      now: at,
      labels,
      palette: widgetPalette,
    })!;

  it("skips running-only changes while the published attention snapshot is fresh", () => {
    const first = snapshot([row("q", { needsInput: true })]);
    markAttentionPublished(first);
    expect(attentionPublishDue(snapshot([row("q", { needsInput: true }), row("r")]), now + 1_000)).toBe(false);
    expect(attentionPublishDue(snapshot([row("q", { needsInput: true }), row("f", { issue: "failed" })]), now + 1_000)).toBe(true);
  });

  it("refreshes an unchanged attention slice before it would expire", () => {
    markAttentionPublished(snapshot([]));
    expect(attentionPublishDue(snapshot([row("r")], now + 3 * 60_000), now + 3 * 60_000)).toBe(false);
    expect(attentionPublishDue(snapshot([row("r")], now + 4 * 60_000), now + 4 * 60_000)).toBe(true);
  });
});
