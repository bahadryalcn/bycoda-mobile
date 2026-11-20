import { describe, expect, it } from "vitest";

import { updateFailureMessage, updateRow, updatesSupported, type UpdatePhase } from "./update-row";

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
  it("retries the exact step that failed instead of re-checking", () => {
    expect(updateRow("error", en, "restart")).toMatchObject({ action: "restart", label: "Try restarting again", detail: "The update is downloaded." });
    expect(updateRow("error", en, "download")).toMatchObject({ action: "download", label: "Try again" });
    expect(updateRow("error", en, "check")).toMatchObject({ action: "check", label: "Try again" });
  });
  it("never claims the app is current after a failed restart", () => {
    expect(updateRow("error", en, "restart").detail).not.toBe("You are up to date.");
  });
  it("explains each failed step in localized, actionable copy", () => {
    const tr = (text: string) => text;
    expect(updateFailureMessage("restart", en)).toContain("downloaded update is kept");
    expect(updateFailureMessage("download", en)).toContain("could not be downloaded");
    expect(updateFailureMessage("check", en)).toContain("Could not check");
    expect(updateFailureMessage("restart", tr)).toContain("yeniden başlatmayı tekrar dene");
  });
  it("is busy and inert while working", () => {
    for (const phase of ["checking", "downloading"] as const)
      expect(updateRow(phase, en)).toMatchObject({ busy: true, action: null });
  });
});
