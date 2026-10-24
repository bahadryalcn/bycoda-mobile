import { describe, expect, it } from "vitest";
import type { HostGoal } from "@/domain/types";
import { goalSettings, validGoalSettings } from "./settings-model";
import { goalFlowReducer } from "./flow";

const goal = { id: "g", status: "running", maxRunMinutes: 20, updatedAt: 1 } as HostGoal;
describe("goal settings safety", () => {
  it("uses the host's optional-value defaults and keeps opening conflict identity in the settings flow", () => {
    expect(goalSettings(goal)).toEqual({ autoMerge: false, continueUntilDone: false, maxRunningTasks: 0, maxRunMinutes: 20 });
    const flow = goalFlowReducer({ kind: "closed" }, { type: "settings", goal });
    expect(flow).toEqual({ kind: "settings", goal });
    expect(goalFlowReducer(flow, { type: "close" })).toEqual({ kind: "closed" });
  });
  it("enforces operational bounds, active status, planning and direct-checkout restrictions", () => {
    const valid = (record: HostGoal, count = "0", minutes = "20", autoMerge = false) =>
      validGoalSettings(record, { ...goalSettings(record), autoMerge }, count, minutes);
    expect(valid(goal)).toBe(true);
    for (const count of ["-1", "9", "1.5", "", "2x"]) expect(valid(goal, count)).toBe(false);
    for (const minutes of ["-1", "10081", "1.5", ""]) expect(valid(goal, "0", minutes)).toBe(false);
    expect(valid({ ...goal, status: "done" })).toBe(false);
    expect(valid({ ...goal, status: "cancelled" })).toBe(false);
    expect(valid({ ...goal, status: "planning" }, "0", "21")).toBe(false);
    expect(valid({ ...goal, status: "planning" })).toBe(true);
    expect(valid({ ...goal, isolate: false }, "0", "20", true)).toBe(false);
  });
});
