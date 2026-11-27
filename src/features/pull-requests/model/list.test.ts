import { describe, expect, it } from "vitest";
import { defaultPrFilters, isBotActivity, isTestFile, matchPrItem, prListItems, prListKeepsPrevious, prListQuery, prRouteFallbackQuery, readPrRoute } from "./list";
import { readPrChecks, readPrLabels, readPrReviewers } from "./results";
import { prCheckBucket, prChecksSummary, prCheckUrl, shortSha, sortPrChecks } from "./checks";
import type { RemoteInboxItem } from "../../../../../src/features/inbox/model/remoteInbox";
const item: RemoteInboxItem = { provider: "github", kind: "pr", number: 1, repo: "owner/repo", projectPath: "C:/repo", title: "PR", url: "https://github.com/owner/repo/pull/1", state: "open", draft: false, labels: [], assignees: [], updatedAt: "2026-11-17", createdAt: "2026-11-10" };
describe("PR list and local display", () => {
  it("reads the code hosts' pull requests with the desktop's state rule, Assigned to me and search", () => {
    expect(prListQuery(defaultPrFilters)).toEqual({ providers: ["github", "gitlab", "azuredevops"], githubKinds: ["pr"], state: "all", assignedToMe: false, search: "" });
    expect(prListQuery({ ...defaultPrFilters, view: { ...defaultPrFilters.view, statuses: ["open"] }, assigned: true, search: "parser" }))
      .toMatchObject({ state: "open", assignedToMe: true, search: "parser" });
    expect(prRouteFallbackQuery({ repo: "owner/repo" })).toMatchObject({ providers: ["github"], state: "all", search: "repo:owner/repo sort:updated-desc" });
  });
  it("lists pull and merge requests only, narrowed and ordered by the shared Inbox view", () => {
    const second = { ...item, number: 2, title: "A first", updatedAt: "2026-11-18" };
    const rows = [item, second, { ...item, number: 3, state: "MERGED" }, { ...item, number: 4, provider: "gitlab" as const }, { ...item, number: 5, kind: "issue" as const }];
    expect(prListItems(rows, defaultPrFilters.view).map(row => row.number)).toEqual([2, 1, 3, 4]);
    expect(prListItems(rows, { ...defaultPrFilters.view, statuses: ["merged"] }).map(row => row.number)).toEqual([3]);
    expect(prListItems(rows, { ...defaultPrFilters.view, provider: "gitlab" }).map(row => row.number)).toEqual([4]);
    expect(prListItems([item, second], { ...defaultPrFilters.view, sort: "title" }).map(row => row.number)).toEqual([2, 1]);
  });
  it("keeps a previous read on screen only for the same project", () => {
    const previous = { projectId: "p", query: prListQuery(defaultPrFilters) };
    expect(prListKeepsPrevious(previous, "p")).toBe(true);
    expect(prListKeepsPrevious(previous, "other")).toBe(false);
    expect(prListKeepsPrevious(undefined, "p")).toBe(false);
  });
  it("recognizes test files and bots without hiding ordinary files or humans", () => {
    for (const path of ["src/foo.test.ts", "src/foo.spec.tsx", "__tests__/a.ts", "tests/a.rs", "api/test_api.py", "api/api_test.go"]) expect(isTestFile(path)).toBe(true);
    expect(isTestFile("src/latest.ts")).toBe(false);
    expect(isBotActivity("dependabot[bot]")).toBe(true);
    expect(isBotActivity("alice")).toBe(false);
  });
  it("rejects malformed route identity", () => {
    const params = { id: "1", repo: item.repo, projectPath: item.projectPath };
    expect(readPrRoute(params)).toEqual({ number: 1, repo: item.repo, projectPath: item.projectPath });
    for (const id of ["0", "01", "1.5", "-1", "abc", "9007199254740993"]) expect(readPrRoute({ ...params, id })).toBeNull();
    for (const repo of ["owner", "owner/repo/extra", "owner/re po", ""]) expect(readPrRoute({ ...params, repo })).toBeNull();
    expect(readPrRoute({ ...params, projectPath: "x".repeat(1_025) })).toBeNull();
    expect(readPrRoute({ ...params, projectPath: undefined })).toBeNull();
    expect(readPrRoute({ ...params, id: ["1"] })).toBeNull();
  });
  it("matches a route to a cached item by identity only", () => {
    const target = { number: 1, repo: item.repo, projectPath: item.projectPath };
    expect(matchPrItem([item], target)).toBe(item);
    expect(matchPrItem([item], { ...target, projectPath: "C:/other" })).toBeNull();
    expect(matchPrItem([{ ...item, provider: "gitlab" }], target)).toBeNull();
    expect(matchPrItem(undefined, target)).toBeNull();
  });
});
describe("PR result trust boundary", () => {
  it("requires exact checks head and bounded response fields", () => {
    expect(readPrChecks({ headOid: "a".repeat(40), checks: [{ name: "test", workflow: "CI", state: "success" }] }).checks).toHaveLength(1);
    expect(() => readPrChecks({ headOid: "main", checks: [] })).toThrow();
    expect(() => readPrChecks({ headOid: "a".repeat(40), checks: [{ name: "CI" }] })).toThrow();
    expect(() => readPrChecks({ headOid: "a".repeat(40), checks: Array(1001).fill({}) })).toThrow();
  });
  it("requires label completeness and reviewer identity", () => {
    expect(readPrLabels({ labels: [], available: [{ name: "bug", color: "ff0000" }], truncated: false }).available).toHaveLength(1);
    expect(() => readPrLabels({ labels: [], available: [] })).toThrow();
    expect(readPrReviewers({ reviewRequests: [{ login: "alice" }], latestReviews: [{ author: { login: "bob" }, state: "APPROVED" }] }).latestReviews).toHaveLength(1);
    expect(() => readPrReviewers({ reviewRequests: [{}], latestReviews: [] })).toThrow();
  });
});
describe("PR checks presentation", () => {
  const check = (state: string, name = state) => ({ name, workflow: "CI", state, url: null });
  it("summarizes failures first and omits empty buckets", () => {
    expect(prChecksSummary([check("pass"), check("pass"), check("skipping"), check("fail"), check("weird")])).toEqual([
      { bucket: "fail", count: 1 }, { bucket: "pass", count: 2 }, { bucket: "skipping", count: 1 }, { bucket: "unknown", count: 1 }]);
    expect(prCheckBucket("PASS")).toBe("pass");
  });
  it("orders failing and running checks before the rest, keeping provider order within a state", () => {
    expect(sortPrChecks([check("pass", "a"), check("fail", "b"), check("pending", "c"), check("pass", "d")]).map(row => row.name)).toEqual(["b", "c", "a", "d"]);
  });
  it("opens only https check links and shortens the head SHA", () => {
    expect(prCheckUrl("https://github.com/o/r/actions/runs/1")).toBe("https://github.com/o/r/actions/runs/1");
    expect(prCheckUrl("javascript:alert(1)")).toBeUndefined();
    expect(prCheckUrl(null)).toBeUndefined();
    expect(shortSha("856d662cb79a2d54c062b8d95bdefd519066f819")).toBe("856d662");
  });
});
