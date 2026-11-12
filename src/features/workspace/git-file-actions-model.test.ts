import { describe, expect, it } from "vitest";
import { gitFileRowActions, gitSwipeActions } from "./git-file-actions-model";

describe("git file row actions", () => {
  it("offers stage, preview, open and discard for an unstaged change", () => {
    expect(gitFileRowActions({ status: "modified" }, false)).toEqual(["stage", "preview", "open", "discard"]);
  });
  it("offers unstage but no discard for a staged change", () => {
    expect(gitFileRowActions({ status: "modified" }, true)).toEqual(["unstage", "preview", "open"]);
  });
  it("cannot open a deleted file", () => {
    expect(gitFileRowActions({ status: "deleted" }, false)).toEqual(["stage", "preview", "discard"]);
  });
  it("swipes only stage, unstage and discard", () => {
    expect(gitSwipeActions(gitFileRowActions({ status: "modified" }, false))).toEqual(["stage", "discard"]);
  });
});
