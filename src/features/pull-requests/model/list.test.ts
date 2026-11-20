import { describe, expect, it } from "vitest";
import { defaultPrFilters, isBotActivity, isTestFile, matchPrItem, prListItems, prListQuery, readPrRoute } from "./list";
import { readPrChecks, readPrLabels, readPrReviewers } from "./results";
import type { RemoteInboxItem } from "../../../../../src/features/inbox/model/remoteInbox";
const item: RemoteInboxItem = { provider: "github", kind: "pr", number: 1, repo: "owner/repo", projectPath: "C:/repo", title: "PR", url: "https://github.com/owner/repo/pull/1", state: "open", draft: false, labels: [], assignees: [], updatedAt: "2026-11-17", createdAt: "2026-11-10" };
describe("PR list and local display", () => {
  it("applies provider-side state, ownership, review and sort qualifiers", () => {
    expect(prListQuery({ state: "closed", mine: true, reviewRequested: true, sort: "oldest" })).toEqual({ providers: ["github"], githubKinds: ["pr"], state: "all", assignedToMe: false, search: "is:closed is:unmerged author:@me review-requested:@me sort:created-asc" });
    expect(prListQuery({ ...defaultPrFilters, state: "merged" }).search).toContain("is:merged");
  });
  it("orders created and updated independently and excludes other providers/states", () => {
    const second = { ...item, number: 2, createdAt: "2026-11-12", updatedAt: "2026-11-15" };
    expect(prListItems([item, second, { ...item, state: "merged" }, { ...item, provider: "gitlab" }], defaultPrFilters).map(row => row.number)).toEqual([1, 2]);
    expect(prListItems([item, second], { ...defaultPrFilters, sort: "created" }).map(row => row.number)).toEqual([2, 1]);
    expect(prListItems([item, second], { ...defaultPrFilters, sort: "oldest" }).map(row => row.number)).toEqual([1, 2]);
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
