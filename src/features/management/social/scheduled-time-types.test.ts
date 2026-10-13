import { describe, expect, it } from "vitest";
import { parseLocalPublishTime } from "./scheduled-time-types";

describe("local campaign date input", () => {
  it("rejects calendar rollover and invalid clock values", () => {
    for (const [date, time] of [["2026-02-29", "12:00"], ["2026-04-31", "12:00"], ["2026-13-01", "12:00"], ["2026-10-12", "24:00"], ["2026-10-12", "12:60"], ["2026-1-2", "09:00"]])
      expect(parseLocalPublishTime(date!, time!)).toBeNull();
  });

  it("preserves the phone's local date and time including leap days", () => {
    const date = parseLocalPublishTime("2028-02-29", "23:45")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()])
      .toEqual([2028, 1, 29, 23, 45]);
  });
});
