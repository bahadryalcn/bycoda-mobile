import { describe, expect, it } from "vitest";
import { getQueryPresentation } from "./query-presentation";

describe("query presentation", () => {
  it("does not spin or show empty for a disabled dependent query", () => {
    expect(
      getQueryPresentation(
        { status: "pending", fetchStatus: "idle", isPending: true, isEnabled: false },
        true,
      ),
    ).toBe("idle");
  });
  it("shows loading only while the initial request is fetching", () => {
    expect(
      getQueryPresentation({ status: "pending", fetchStatus: "fetching", isPending: true }, true),
    ).toBe("loading");
    expect(
      getQueryPresentation({ status: "pending", fetchStatus: "idle", isPending: true }, true),
    ).toBe("idle");
  });
  it("represents paused initial and cached requests as offline warnings", () => {
    expect(getQueryPresentation({ status: "pending", fetchStatus: "paused" }, true)).toBe("paused");
    expect(getQueryPresentation({ status: "success", fetchStatus: "paused", data: [1] })).toBe(
      "paused",
    );
  });
  it("does not replace cached content with loading during background refresh", () => {
    expect(
      getQueryPresentation({
        status: "success",
        fetchStatus: "fetching",
        isFetching: true,
        data: [1],
      }),
    ).toBe("ready");
  });
  it("keeps cached content with warning after a failed refresh", () => {
    expect(
      getQueryPresentation(
        { status: "error", fetchStatus: "idle", data: [], error: new Error("Offline") },
        true,
      ),
    ).toBe("stale-error");
  });
  it("treats revoked keys and identity failures as connection repair", () => {
    for (const kind of ["auth", "identity"])
      expect(getQueryPresentation({ data: [1], error: { kind } })).toBe("error");
  });
  it("does not mistake request failure for an empty list", () => {
    expect(getQueryPresentation({ status: "error", error: new Error("Unavailable") }, true)).toBe(
      "error",
    );
  });
  it("shows empty only after a successful result, including null detail", () => {
    expect(getQueryPresentation({ status: "success", data: [] }, true)).toBe("empty");
    expect(getQueryPresentation({ status: "success", data: null }, true)).toBe("empty");
    expect(getQueryPresentation({}, true)).toBe("idle");
  });
});
