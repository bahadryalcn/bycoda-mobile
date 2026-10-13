import { describe, expect, it } from "vitest";
import { acknowledgeSettingsDraft, settingsFields, validSettingsFields } from "./settings-draft";

describe("host settings draft snapshots", () => {
  it("derives a clean form from the current server values", () => {
    expect(settingsFields({ maxRunningTasks: 2, dailyAgentMinutes: 120 })).toEqual({
      maxRunning: "2",
      dailyMinutes: "120",
    });
    expect(settingsFields({ maxRunningTasks: 3, dailyAgentMinutes: 0 })).toEqual({
      maxRunning: "3",
      dailyMinutes: "0",
    });
  });
  it("clears only the submitted draft after an acknowledgement", () => {
    const submitted = { maxRunning: "3", dailyMinutes: "120" };
    expect(acknowledgeSettingsDraft({ override: submitted }, submitted)).toEqual({
      override: null,
    });
    const edited = { override: { maxRunning: "4", dailyMinutes: "120" } };
    expect(acknowledgeSettingsDraft(edited, submitted)).toBe(edited);
    const editedBack = { override: { ...submitted } };
    expect(acknowledgeSettingsDraft(editedBack, submitted)).toBe(editedBack);
  });
  it("validates task concurrency and whole nonnegative minute limits", () => {
    expect(validSettingsFields({ maxRunning: "8", dailyMinutes: "0" })).toBe(true);
    for (const values of [
      { maxRunning: "", dailyMinutes: "10" },
      { maxRunning: "9", dailyMinutes: "10" },
      { maxRunning: "1.5", dailyMinutes: "10" },
      { maxRunning: "2", dailyMinutes: "-1" },
      { maxRunning: "2", dailyMinutes: "1.5" },
    ])
      expect(validSettingsFields(values)).toBe(false);
  });
});
