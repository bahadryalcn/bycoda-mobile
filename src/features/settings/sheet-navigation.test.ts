import { describe, expect, it, vi } from "vitest";
import { leaveSheetThen } from "./sheet-navigation";

describe("settings sheet navigation", () => {
  it("closes the sheet before navigating to the destination", () => {
    const calls: string[] = [];
    leaveSheetThen(
      () => calls.push("close"),
      () => calls.push("navigate"),
    );
    expect(calls).toEqual(["close", "navigate"]);
  });

  it("still runs the destination exactly once", () => {
    const close = vi.fn();
    const go = vi.fn();
    leaveSheetThen(close, go);
    expect(close).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
  });
});
