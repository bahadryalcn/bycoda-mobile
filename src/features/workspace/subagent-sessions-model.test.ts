import { describe, expect, it } from "vitest";
import type { HostSessionSummary } from "@/domain/types";
import { childSessions, parentLinkOf } from "./subagent-sessions-model";

const row = (id: string, extra: Partial<HostSessionSummary> = {}) =>
  ({ id, title: id, projectId: "p", harness: "codex", revision: 1, status: "idle", updatedAt: 1, ...extra }) as HostSessionSummary;
const link = (parentSessionId: string, startedAt: number, kind: "subagent" | "advisor" = "subagent") =>
  ({ parentSessionId, runId: "r", kind, model: "codex:gpt-5", startedAt });

describe("subagent child sessions", () => {
  it("keeps only this parent's children, oldest first, with state and meta", () => {
    const list = childSessions([
      row("late", { delegationParent: link("a", 20), status: "running" }),
      row("other", { delegationParent: link("b", 5) }),
      row("plain", { delegationParent: null }),
      row("early", { delegationParent: link("a", 10), issue: "failed", model: "claude:opus" }),
    ], "a");
    expect(list.map((c) => c.sessionId)).toEqual(["early", "late"]);
    expect(list[0]).toMatchObject({ state: "failed", meta: "codex · opus", projectId: "p" });
    expect(list[1].state).toBe("running");
  });
  it("is empty for an older Host without delegation data", () => {
    expect(childSessions([row("x")], "a")).toEqual([]);
    expect(childSessions(undefined, "a")).toEqual([]);
  });
  it("keeps an interrupted child distinct from a completed child", () => {
    const list = childSessions([row("interrupted", { delegationParent: link("a", 1), status: "interrupted" }), row("done", { delegationParent: link("a", 2) })], "a");
    expect(list.map(child => child.state)).toEqual(["interrupted", "completed"]);
  });
  it("reads the parent link from the summary or the child's settings", () => {
    expect(parentLinkOf({ delegationParent: link("a", 1) })?.parentSessionId).toBe("a");
    expect(parentLinkOf({ modelSettings: { delegationParent: JSON.stringify(link("b", 1, "advisor")) } })).toMatchObject({ parentSessionId: "b", kind: "advisor" });
    expect(parentLinkOf({ modelSettings: { delegationParent: "junk" } })).toBeUndefined();
    expect(parentLinkOf(undefined)).toBeUndefined();
  });
});
