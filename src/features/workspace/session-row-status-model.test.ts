import { expect, it } from "vitest";
import { sessionRowBadge } from "./session-row-status-model";

it("matches the desktop row status tones", () => {
  expect(sessionRowBadge("failed", false)).toEqual({ tone: "danger", icon: "alert" });
  for (const kind of ["retrying", "interrupted", "input"] as const)
    expect(sessionRowBadge(kind, false)).toEqual({ tone: "warning", icon: "alert" });
  expect(sessionRowBadge("working", false)?.tone).toBe("info");
  expect(sessionRowBadge("waiting", false)?.tone).toBe("default");
  expect(sessionRowBadge("done", true)?.tone).toBe("success");
});

it("shows a draft badge only for an otherwise idle row", () => {
  expect(sessionRowBadge("idle", true)).toEqual({ tone: "default", icon: "draft" });
  expect(sessionRowBadge("idle", false)).toBeUndefined();
  expect(sessionRowBadge("working", true)?.icon).toBe("working");
});
