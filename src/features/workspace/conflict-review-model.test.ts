import { expect, it } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { conflictParts, conflictWriteRefused, resolveConflictParts, readConflictStages } from "./conflict-review-model";
it("allows another attempt only after the Host clearly refused the resolution", () => {
  expect(conflictWriteRefused(new RemoteHostError("machine", "host", "Snapshot changed"))).toBe(true);
  expect(conflictWriteRefused(new RemoteHostError("machine", "network", "Lost", true))).toBe(false);
  expect(conflictWriteRefused(new RemoteHostError("machine", "timeout", "Slow"))).toBe(false);
  expect(conflictWriteRefused(new RemoteHostError("machine", "network", "Offline"))).toBe(false);
  expect(conflictWriteRefused(new Error("Unknown"))).toBe(false);
});
it("resolves each reviewed block independently while preserving all context, CRLF and final-newline state", () => {
  const working = "before\r\n<<<<<<< HEAD\r\nours\r\n||||||| base\r\nold\r\n=======\r\ntheirs\r\n>>>>>>> incoming\r\nafter";
  const parts = conflictParts(working);
  expect(parts[1]).toMatchObject({ ours: "ours\r\n", theirs: "theirs\r\n", base: "old\r\n" });
  expect(resolveConflictParts(parts, { "0": "both" })).toBe("before\r\nours\r\ntheirs\r\nafter");
  expect(resolveConflictParts(parts, { "0": "theirs" })).toBe("before\r\ntheirs\r\nafter");
  expect(() => resolveConflictParts(parts, {})).toThrow();
});
it("rejects ambiguous markers, stale paths and oversized text rather than guessing a resolution", () => {
  for (const text of ["<<<<<<< ours\na\n", "=======\n", "<<<<<<< ours\n<<<<<<< nested\na\n=======\nb\n>>>>>>> theirs\n", "x\0", "x\n".repeat(4001)]) expect(() => conflictParts(text)).toThrow();
  expect(resolveConflictParts(conflictParts("already resolved"), {})).toBe("already resolved");
  expect(() => readConflictStages({ relative: "other", kind: "both-modified", base: "", ours: "", theirs: "", binary: false, tooLarge: false }, "a.txt")).toThrow();
});
