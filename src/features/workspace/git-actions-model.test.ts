import { describe, expect, it } from "vitest";
import { gitSheetActions } from "./git-actions-model";

const copy = (_tr: string, en: string, v: Record<string, string | number> = {}) =>
  en.replace(/\{(\w+)\}/g, (_m, k) => String(v[k]));
const base = { files: [{ staged: true }, { staged: false }] as never[], ahead: 0, behind: 0, remote: "origin/main" };
const find = (index: object, key: string, busy = false) =>
  gitSheetActions(index as never, { busy, canRunWorkspace: true }, copy).find((a) => a.key === key)!;

describe("git sheet actions", () => {
  it("disables push with a reason when there is nothing to push", () => {
    expect(find(base, "push")).toMatchObject({ disabled: true, detail: "No local commits to push." });
  });
  it("enables push with the commit count", () => {
    expect(find({ ...base, ahead: 2 }, "push")).toMatchObject({ disabled: false, detail: "2 commits to push" });
  });
  it("explains a missing remote for push, pull and fetch", () => {
    const index = { ...base, remote: undefined };
    for (const key of ["push", "pull", "fetch"])
      expect(find(index, key)).toMatchObject({ disabled: true, detail: "This branch has no remote." });
  });
  it("summarizes commit and disables everything while busy", () => {
    expect(find(base, "commit").detail).toBe("2 files changed, 1 staged");
    expect(find(base, "commit", true).disabled).toBe(true);
  });
  it("gates the pull request row on pushed commits beyond the default branch", () => {
    const pr = { ...base, branch: "feat", defaultBranch: "main", aheadOfDefault: 2, headPushed: true };
    expect(find(pr, "createPr")).toMatchObject({ disabled: false });
    expect(find({ ...pr, aheadOfDefault: 0 }, "createPr")).toMatchObject({ disabled: true, detail: "This branch has no commits to include." });
    expect(find({ ...pr, headPushed: false }, "createPr")).toMatchObject({ disabled: true, detail: "Push the branch first." });
    expect(find({ ...pr, branch: "main" }, "createPr").disabled).toBe(true);
  });
  it("offers linking only when the Host supports it, with the reason when it cannot", () => {
    const all = (linkPr?: { hasSession: boolean; linked?: { number: number } }) =>
      gitSheetActions(base as never, { busy: false, canRunWorkspace: true, linkPr }, copy);
    expect(all().some((a) => a.key === "linkPr")).toBe(false);
    expect(all({ hasSession: true, linked: { number: 7 } }).find((a) => a.key === "linkPr")).toMatchObject({ disabled: false, detail: "#7 linked" });
    expect(all({ hasSession: false }).find((a) => a.key === "linkPr")).toMatchObject({ disabled: true });
    expect(gitSheetActions({ ...base, remote: undefined } as never, { busy: false, canRunWorkspace: true, linkPr: { hasSession: true } }, copy).find((a) => a.key === "linkPr")).toMatchObject({ disabled: true, detail: "This branch has no remote." });
  });
});
