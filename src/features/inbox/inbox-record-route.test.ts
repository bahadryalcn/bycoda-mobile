import { expect, it } from "vitest";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { inboxRecordHref, inboxRecordParams, matchInboxRecord, readInboxRecordRoute, recallInboxRecord, recallJiraSnapshot, rememberInboxRecord, rememberJiraSnapshot } from "./inbox-record-route";
import type { JiraBoardSnapshot } from "./jira-board-model";

const issue: RemoteInboxItem = { provider: "gitlab", kind: "issue", number: 4, title: "Fix", url: "", state: "opened", updatedAt: "2026-11-20",
  repo: "group/app", projectPath: "/app", draft: false, labels: [], assignees: [] };
const jira: RemoteInboxItem = { ...issue, provider: "jira", kind: "jira", number: 12, repo: "", identifier: "ENG-12" };
const origin = { machineId: "machine", projectId: "project" };

it("round-trips record identity through route params and rejects malformed links", () => {
  for (const record of [issue, jira, { ...issue, provider: "linear" as const, kind: "linear" as const, repo: "", id: "lin_1" }]) {
    const target = readInboxRecordRoute(inboxRecordParams(record, origin));
    expect(target).not.toBeNull();
    expect(matchInboxRecord([record], target!)).toBe(record);
  }
  const params = inboxRecordParams(issue, origin);
  for (const bad of [{ provider: "slack" }, { kind: "jira" }, { number: "04" }, { number: "-1" }, { repo: "" }, { projectPath: "x".repeat(1_025) }])
    expect(readInboxRecordRoute({ ...params, ...bad })).toBeNull();
  expect(readInboxRecordRoute({ ...inboxRecordParams(jira, origin), identifier: "" })).toBeNull();
  expect(readInboxRecordRoute({ ...inboxRecordParams(jira, origin), identifier: ["ENG-12"] })).toBeNull();
});

it("matches identity only, never another project path or tracker key", () => {
  const target = readInboxRecordRoute(inboxRecordParams(jira, origin))!;
  expect(matchInboxRecord([{ ...jira, identifier: "ENG-13" }], target)).toBeNull();
  expect(matchInboxRecord([{ ...jira, projectPath: "/other" }], target)).toBeNull();
});

it("keeps GitHub pull requests on their deep-linkable page and opens the rest on the record page", () => {
  const pr = { ...issue, provider: "github" as const, kind: "pr" as const, repo: "owner/repo" };
  expect(inboxRecordHref(pr, origin)).toMatchObject({ pathname: "/pull-requests/[id]", params: { id: "4", repo: "owner/repo", machineId: "machine" } });
  expect(inboxRecordHref(issue, origin)).toMatchObject({ pathname: "/inbox/record", params: { provider: "gitlab", kind: "issue", number: "4" } });
});

it("hands a tapped board row and its snapshot to the pushed page for the same computer and project only", () => {
  rememberInboxRecord(origin, jira);
  const target = readInboxRecordRoute(inboxRecordParams(jira, origin))!;
  expect(recallInboxRecord("machine", "project", target)).toBe(jira);
  expect(recallInboxRecord("machine", "other", target)).toBeNull();
  const snapshot = { snapshotId: "snap-1" } as JiraBoardSnapshot;
  rememberJiraSnapshot(origin, snapshot);
  expect(recallJiraSnapshot("machine", "project", "snap-1")).toBe(snapshot);
  expect(recallJiraSnapshot("other", "project", "snap-1")).toBeNull();
  expect(recallJiraSnapshot("machine", "project", undefined)).toBeNull();
});
