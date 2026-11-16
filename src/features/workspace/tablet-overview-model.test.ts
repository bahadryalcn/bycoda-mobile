import { describe, expect, it } from "vitest";
import type { ActiveSession } from "./activity-model";
import { tabletOverviewModel } from "./tablet-overview-model";

function row(id: string, fields: Partial<ActiveSession["session"]> = {}): ActiveSession {
  return {
    project: { id: "project", name: "Project", cwd: "/project" },
    session: { id, projectId: "project", title: id, harness: "codex", revision: 1,
      status: "idle", updatedAt: 1, ...fields },
  };
}

describe("tablet overview", () => {
  it("counts visible work and failures without duplicating attention in recent sessions", () => {
    const model = tabletOverviewModel([
      row("running", { status: "running" }),
      row("input", { needsInput: true, status: "running", updatedAt: 3 }),
      row("failed", { issue: "failed", updatedAt: 2 }),
      row("retrying", { issue: "retrying" }),
      row("archived", { archived: true, needsInput: true }),
      row("snoozed", { snoozedUntil: 101, status: "running" }),
      row("child", { orchestrationLeadId: "lead", needsInput: true }),
    ], [{ id: "a" }, { id: "b" }, { id: "c" }], new Set(["a", "b", "missing"]), 100);
    expect(model.running).toBe(2);
    expect(model.attentionCount).toBe(2);
    expect(model.attention.map(({ session }) => session.id)).toEqual(["input", "failed"]);
    expect(model.recent.map(({ session }) => session.id)).toEqual(["running", "retrying"]);
    expect(model.connected).toBe(2);
    expect(model.total).toBe(3);
  });

  it("sorts by turn activity, limits previews, and counts beyond the preview", () => {
    const directory = Array.from({ length: 9 }, (_, index) => row(String(index), {
      updatedAt: 100 - index, lastActivityAt: index, needsInput: true,
    }));
    const recent = Array.from({ length: 8 }, (_, index) => row(`recent-${index}`, {
      updatedAt: 100 - index, lastActivityAt: index,
    }));
    const original = [...directory, ...recent];
    const model = tabletOverviewModel(original, [], new Set(), 100);
    expect(model.attentionCount).toBe(9);
    expect(model.attention.map(({ session }) => session.id)).toEqual(["8", "7", "6", "5", "4"]);
    expect(model.recent.map(({ session }) => session.id)).toEqual([
      "recent-7", "recent-6", "recent-5", "recent-4", "recent-3", "recent-2",
    ]);
    expect(original[0]?.session.id).toBe("0");
  });

  it("restores expired snoozes and handles an empty directory", () => {
    expect(tabletOverviewModel([row("expired", { snoozedUntil: 100 })], [], new Set(), 100).recent).toHaveLength(1);
    expect(tabletOverviewModel([], [], new Set(), 100)).toEqual({
      running: 0, attentionCount: 0, connected: 0, total: 0, attention: [], recent: [],
    });
  });
});
