import { describe, expect, it } from "vitest";
import { busyAlternateMode, busyPrimaryMode } from "./busy-send";

const both = { queue: true, steer: true };
describe("busy send", () => {
  it("uses the preferred mode and falls back to the other", () => {
    expect(busyPrimaryMode("steer", both)).toBe("steer");
    expect(busyPrimaryMode("queue", both)).toBe("queue");
    expect(busyPrimaryMode("steer", { queue: true, steer: false })).toBe("queue");
    expect(busyPrimaryMode("queue", { queue: false, steer: true })).toBe("steer");
    expect(busyPrimaryMode("steer", { queue: false, steer: false })).toBeNull();
  });
  it("offers the other mode only when deliverable", () => {
    expect(busyAlternateMode("steer", both)).toBe("queue");
    expect(busyAlternateMode("queue", both)).toBe("steer");
    expect(busyAlternateMode("queue", { queue: true, steer: false })).toBeNull();
    expect(busyAlternateMode("send", both)).toBeNull();
  });
});
