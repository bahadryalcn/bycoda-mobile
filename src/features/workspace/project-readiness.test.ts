import { describe, expect, it } from "vitest";
import { getProjectDirectoryReadiness } from "./project-readiness";

describe("project directory readiness", () => {
  const ready = {
    readable: true, hasData: true, grouped: true, privacyReady: true, isFetching: false,
  };

  it("distinguishes first load and revalidation from a desktop sync requirement", () => {
    expect(getProjectDirectoryReadiness({ ...ready, hasData: false, isFetching: true })).toBe("loading");
    expect(getProjectDirectoryReadiness({ ...ready, readable: false, isFetching: true })).toBe("loading");
    expect(getProjectDirectoryReadiness({ ...ready, privacyReady: false })).toBe("sync-required");
    expect(getProjectDirectoryReadiness({ ...ready, privacyReady: false, isFetching: true })).toBe("sync-required");
  });

  it("keeps proven content during ordinary refreshes and refresh failures", () => {
    expect(getProjectDirectoryReadiness({ ...ready, isFetching: true })).toBe("ready");
    expect(getProjectDirectoryReadiness({ ...ready, error: new Error("Network unavailable") })).toBe("ready");
  });

  it("does not turn blocked access or a failed verification into a missing project", () => {
    expect(getProjectDirectoryReadiness({ ...ready, readable: false })).toBe("waiting");
    expect(getProjectDirectoryReadiness({ ...ready, readable: false, error: new Error("Network unavailable") })).toBe("error");
    expect(getProjectDirectoryReadiness({ ...ready, hasData: false })).toBe("waiting");
  });

  it("accepts verified empty directories and legacy hosts without grouped metadata", () => {
    expect(getProjectDirectoryReadiness(ready)).toBe("ready");
    expect(getProjectDirectoryReadiness({ ...ready, grouped: false, privacyReady: undefined })).toBe("ready");
  });
});
