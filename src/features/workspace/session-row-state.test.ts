import { expect, it } from "vitest";
import { sessionRowKind } from "./session-row-state";

it("derives one desktop row status from the wire summary", () => {
  expect(sessionRowKind({ status: "running", issue: "retrying" })).toBe("retrying");
  expect(sessionRowKind({ status: "idle", issue: "failed" })).toBe("failed");
  expect(sessionRowKind({ status: "idle", issue: "failed", needsInput: true })).toBe("input");
  expect(sessionRowKind({ status: "interrupted" })).toBe("interrupted");
  expect(sessionRowKind({ status: "running", needsInput: true })).toBe("input");
  expect(sessionRowKind({ status: "running", waiting: { kind: "background" } as never })).toBe("waiting");
  expect(sessionRowKind({ status: "running" }, true)).toBe("working");
  expect(sessionRowKind({ status: "idle" }, true)).toBe("done");
  expect(sessionRowKind({ status: "idle" })).toBe("idle");
});
