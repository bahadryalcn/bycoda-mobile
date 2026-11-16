import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { planOutline, readyPlan, reviewedPlanCommand } from "./plan-review-model";
const plan = { id: "p", role: "plan", text: "# Plan\n1. First", plan: { status: "ready" } } as Block;
describe("plan outline", () => {
  it("reads top-level list items with nested notes and skips code fences", () => {
    expect(planOutline("# Plan\n1. **Add** model\n   - schema\n   - tests\n   - extra\n- Ship\n```\n- not a step\n```")).toEqual([
      { id: "0", title: "Add model", description: "schema · tests" },
      { id: "1", title: "Ship", description: undefined },
    ]);
    expect(planOutline("Just prose")).toEqual([]);
  });
});
describe("reviewed plan", () => {
  it("pins exact base and block identity while approving edited text", () => {
    expect(reviewedPlanCommand("s", plan, plan, "# Plan\n1. Edited")).toEqual({
      type: "send", sessionId: "s", intent: "build", planBlockId: "p", expectedPlanText: plan.text,
      text: "# Plan\n1. Edited",
    });
  });
  it("rejects changed, streamed, orchestration, built and empty plans", () => {
    for (const current of [{ ...plan, text: "changed" }, { ...plan, id: "other" },
      { ...plan, streaming: true }, { ...plan, orchestration: {} } as Block,
      { ...plan, plan: { status: "built" as const } }])
      expect(() => reviewedPlanCommand("s", plan, current, "approved")).toThrow();
    expect(readyPlan({ ...plan, text: " " })).toBe(false);
    expect(() => reviewedPlanCommand("s", plan, plan, "\0bad")).toThrow();
  });
});
