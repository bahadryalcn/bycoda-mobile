import { expect, it } from "vitest";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { applyInboxView, defaultInboxView, inboxActiveFilters, inboxFetchState, inboxFilterOptions, LINEAR_NO_PROJECT, narrowInbox, normalizeInboxView, providerCounts, statusCategory, statusTone, viewFilterCount } from "./provider-view-model";

const item = (patch: Partial<RemoteInboxItem>): RemoteInboxItem => ({
  provider: "github", kind: "issue", number: 1, title: "t", url: "", state: "OPEN", updatedAt: "2026-11-20T10:00:00Z",
  repo: "acme/web", projectPath: "/p", draft: false, labels: [], assignees: [], ...patch,
});

it("reads the desktop status categories, including tracker workflow names", () => {
  expect(statusCategory(item({ kind: "pr", draft: true }))).toBe("draft");
  expect(statusCategory(item({ kind: "pr", state: "MERGED" }))).toBe("merged");
  expect(statusCategory(item({ kind: "jira", state: "Done" }))).toBe("closed");
  expect(statusCategory(item({ kind: "jira", state: "Development in progress" }))).toBe("open");
  expect(statusTone(item({ kind: "jira", state: "Development in progress" }))).toBe("info");
  expect(statusTone(item({ kind: "jira", state: "Release candidate" }))).toBe("info");
  expect(statusTone(item({ state: "OPEN" }))).toBe("success");
  expect(statusTone(item({ kind: "pr", state: "MERGED" }))).toBe("active");
});

it("counts rows per provider in desktop order and filters, sorts and narrows locally", () => {
  const rows = [
    item({ provider: "jira", kind: "jira", number: 3, updatedAt: "2026-11-21T10:00:00Z", labels: [{ name: "bug", color: "" }] }),
    item({ number: 1, kind: "pr" }),
    item({ provider: "jira", kind: "jira", number: 4, state: "Done", updatedAt: "2026-10-01T10:00:00Z" }),
  ];
  expect(providerCounts(rows)).toEqual([{ provider: "github", count: 1 }, { provider: "jira", count: 2 }]);
  expect(applyInboxView(rows, { ...defaultInboxView, provider: "jira" }).map((row) => row.number)).toEqual([3, 4]);
  expect(applyInboxView(rows, { ...defaultInboxView, type: "pr" }).map((row) => row.number)).toEqual([1]);
  expect(applyInboxView(rows, { ...defaultInboxView, statuses: ["closed"] }).map((row) => row.number)).toEqual([4]);
  expect(narrowInbox(rows, { ...defaultInboxView, time: "7d" }, Date.parse("2026-11-22T00:00:00Z")).map((row) => row.number)).toEqual([3, 1]);
  expect(viewFilterCount(defaultInboxView)).toBe(0);
  expect(viewFilterCount({ ...defaultInboxView, type: "pr", repos: ["acme/web"] })).toBe(2);
  expect(inboxActiveFilters({ ...defaultInboxView, provider: "jira", sort: "title" }, true)).toBe(3);
});

it("reads every state unless only open or draft work is chosen, like the desktop", () => {
  expect(inboxFetchState([])).toBe("all");
  expect(inboxFetchState(["open", "draft"])).toBe("open");
  expect(inboxFetchState(["open", "merged"])).toBe("all");
});

it("applies the desktop's tracker and repository dimensions only to the rows they describe", () => {
  const rows = [
    item({ number: 1, repo: "acme/web", title: "Beta" }),
    item({ number: 2, repo: "acme/api", title: "Alpha" }),
    item({ provider: "jira", kind: "jira", number: 3, state: "In Review", teamId: "10", teamName: "Platform",
      assignees: [{ login: "Ada", accountId: "acc-ada" }] }),
    item({ provider: "jira", kind: "jira", number: 4, state: "To Do", teamId: "11", assignees: [] }),
    item({ provider: "linear", kind: "linear", number: 5, teamId: "t1", projectId: "p1", projectName: "Launch" }),
    item({ provider: "linear", kind: "linear", number: 6, teamId: "t1" }),
  ];
  const numbers = (view: Partial<typeof defaultInboxView>) => applyInboxView(rows, { ...defaultInboxView, ...view }).map((row) => row.number).sort();
  expect(numbers({ repos: ["acme/api"] })).toEqual([2, 3, 4, 5, 6]);
  expect(numbers({ provider: "jira", workflow: ["In Review"] })).toEqual([3]);
  expect(numbers({ provider: "jira", assignees: ["acc-ada"] })).toEqual([3]);
  expect(numbers({ provider: "jira", unassigned: true })).toEqual([4]);
  expect(numbers({ provider: "jira", teams: ["11"] })).toEqual([4]);
  expect(numbers({ provider: "linear", trackerProjects: [LINEAR_NO_PROJECT] })).toEqual([6]);
  // A Draft or Merged choice alone does not hide tracker issues, which have no such states.
  expect(numbers({ statuses: ["merged"] })).toEqual([3, 4, 5, 6]);
  expect(applyInboxView(rows.slice(0, 2), { ...defaultInboxView, sort: "title" }).map((row) => row.number)).toEqual([2, 1]);
  const options = inboxFilterOptions(rows, { ...defaultInboxView, workflow: ["Done"] }, "No project");
  expect(options.repos.map((option) => option.value)).toEqual(["acme/api", "acme/web"]);
  expect(options.assignees).toEqual([{ value: "acc-ada", label: "Ada" }]);
  expect(options.workflow.map((option) => option.value)).toEqual(["Done", "In Review", "To Do"]);
  expect(options.trackerProjects).toEqual([{ value: "p1", label: "Launch" }, { value: LINEAR_NO_PROJECT, label: "No project" }]);
  expect(options.teams.map((option) => option.label)).toEqual(["11", "Platform", "t1"]);
});

it("normalizes a remembered view from before the desktop filter set", () => {
  expect(normalizeInboxView({ sort: "created" as never, statuses: ["open"] })).toEqual({ ...defaultInboxView, statuses: ["open"] });
});
