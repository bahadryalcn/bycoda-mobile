import { describe, expect, it } from "vitest";

import { updateRow, updatesSupported, type UpdatePhase } from "./update-row";

const en = (_tr: string, text: string) => text;

describe("updatesSupported", () => {
  it("hides the row in development, on web and when updates are disabled", () => {
    expect(updatesSupported({ dev: false, enabled: true, web: false })).toBe(true);
    expect(updatesSupported({ dev: true, enabled: true, web: false })).toBe(false);
    expect(updatesSupported({ dev: false, enabled: false, web: false })).toBe(false);
    expect(updatesSupported({ dev: false, enabled: true, web: true })).toBe(false);
  });
});

describe("updateRow", () => {
  it("walks check, download, explicit restart", () => {
    const action = (phase: UpdatePhase) => updateRow(phase, en).action;
    expect(action("idle")).toBe("check");
    expect(action("error")).toBe("check");
    expect(action("current")).toBe("check");
    expect(action("available")).toBe("download");
    expect(action("ready")).toBe("restart");
  });
  it("is busy and inert while working", () => {
    for (const phase of ["checking", "downloading"] as const)
      expect(updateRow(phase, en)).toMatchObject({ busy: true, action: null });
  });
});
