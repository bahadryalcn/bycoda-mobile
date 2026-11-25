import { expect, it } from "vitest";
import { latestGitAction } from "./git-action-feedback-model";

const idle = { isPending: false, isError: false, isSuccess: false, error: null };

it("reports only the most recent Git action instead of stacking every result", () => {
  const failed = { ...idle, isError: true, error: new Error("Switch failed"), submittedAt: 1 };
  const created = { ...idle, isSuccess: true, submittedAt: 2 };
  const entries = [
    { key: "action", mutation: idle, success: "a" },
    { key: "switchBranch", mutation: failed, success: "b" },
    { key: "createBranch", mutation: created, success: "c" },
  ];
  expect(latestGitAction(entries)?.key).toBe("createBranch");
  expect(latestGitAction([entries[1]!, { key: "x", mutation: { ...idle, isPending: true }, success: "d" }])?.key).toBe("x");
  expect(latestGitAction([entries[0]!])).toBeUndefined();
});
