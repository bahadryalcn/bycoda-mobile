import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
export type JiraMobileBoard = { id: number; name: string; kind: "scrum" | "kanban" };
export type JiraMobileIssue = RemoteInboxItem & {
  identifier: string;
  statusId: string;
  updatedAt: string;
  teamId: string;
};
export type JiraBoardSnapshot = {
  snapshotId: string;
  projectCwd: string;
  board: JiraMobileBoard;
  configuration: {
    columns: { name: string; statusIds: string[] }[];
    rankFieldId: number | null;
    rankSnapshotAvailable: boolean;
    boardKind: "scrum" | "kanban";
    sprints: { id: number; name: string; state: "active" | "future"; goal: string }[];
  };
  page: { issues: JiraMobileIssue[]; nextPageToken: string | null };
  scope: {
    scope: "board" | "backlog" | "sprint";
    sprintId: number | null;
    pageToken: string | null;
  };
};
export type JiraMobileTransition = {
  id: string;
  name: string;
  statusId: string;
  requiresFields: boolean;
};
const record = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Jira board data");
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number, empty = false) => {
  if (typeof value !== "string" || (!empty && !value) || value.length > max || value.includes("\0"))
    throw new Error("Invalid Jira board text");
  return value;
};
const positive = (value: unknown) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new Error("Invalid Jira board identifier");
  return Number(value);
};
const list = (value: unknown, max: number) => {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid Jira board collection");
  return value as unknown[];
};
const bool = (value: unknown) => {
  if (typeof value !== "boolean") throw new Error("Invalid Jira board state");
  return value;
};
export function readJiraBoards(value: unknown): JiraMobileBoard[] {
  return list(value, 500).map((value) => {
    const row = record(value);
    if (!["scrum", "kanban"].includes(String(row.kind))) throw new Error("Invalid Jira board kind");
    return {
      id: positive(row.id),
      name: text(row.name, 1000),
      kind: row.kind as JiraMobileBoard["kind"],
    };
  });
}
export function readJiraBoardSnapshot(value: unknown): JiraBoardSnapshot {
  const row = record(value),
    configuration = record(row.configuration),
    page = record(row.page),
    scope = record(row.scope);
  const snapshotId = text(row.snapshotId, 100);
  if (!/^[a-f\d-]{36}$/i.test(snapshotId)) throw new Error("Invalid Jira board snapshot");
  const board = readJiraBoards([row.board])[0]!;
  if (
    !["board", "backlog", "sprint"].includes(String(scope.scope)) ||
    configuration.boardKind !== board.kind
  )
    throw new Error("Invalid Jira board scope");
  const issues = list(page.issues, 100).map((value) => {
    const issue = record(value);
    const identifier = text(issue.identifier, 200);
    if (
      !/^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(identifier) ||
      issue.provider !== "jira" ||
      issue.kind !== "jira"
    )
      throw new Error("Invalid Jira issue identity");
    const labels = list(issue.labels, 100).map((value) => {
      const label = record(value);
      return { name: text(label.name, 1000), color: text(label.color, 100, true) };
    });
    const assignees = list(issue.assignees, 100).map((value) => {
      const assignee = record(value);
      return {
        login: text(assignee.login, 1000),
        ...(typeof assignee.avatarUrl === "string"
          ? { avatarUrl: text(assignee.avatarUrl, 4000, true) }
          : {}),
      };
    });
    return {
      provider: "jira" as const,
      kind: "jira" as const,
      id: text(issue.id, 200),
      identifier,
      number: positive(issue.number),
      title: text(issue.title, 20_000, true),
      url: text(issue.url, 4000),
      state: text(issue.state, 1000),
      updatedAt: text(issue.updatedAt, 100),
      statusId: text(issue.statusId, 100),
      teamId: text(issue.teamId, 200),
      repo: text(issue.repo, 1000, true),
      projectPath: text(issue.projectPath, 4096, true),
      draft: bool(issue.draft),
      labels,
      assignees,
    };
  });
  if (new Set(issues.map((issue) => issue.identifier)).size !== issues.length)
    throw new Error("Duplicate Jira board issues");
  return {
    snapshotId,
    projectCwd: text(row.projectCwd, 4096),
    board,
    scope: {
      scope: scope.scope as JiraBoardSnapshot["scope"]["scope"],
      sprintId: scope.sprintId === null ? null : positive(scope.sprintId),
      pageToken: scope.pageToken === null ? null : text(scope.pageToken, 4000),
    },
    page: {
      issues,
      nextPageToken: page.nextPageToken === null ? null : text(page.nextPageToken, 4000),
    },
    configuration: {
      boardKind: board.kind,
      rankFieldId: configuration.rankFieldId === null ? null : positive(configuration.rankFieldId),
      rankSnapshotAvailable: bool(configuration.rankSnapshotAvailable),
      columns: list(configuration.columns, 100).map((value) => {
        const column = record(value);
        return {
          name: text(column.name, 1000, true),
          statusIds: list(column.statusIds, 100).map((value) => text(value, 100)),
        };
      }),
      sprints: list(configuration.sprints, 500).map((value) => {
        const sprint = record(value);
        if (!["active", "future"].includes(String(sprint.state)))
          throw new Error("Invalid Jira sprint state");
        return {
          id: positive(sprint.id),
          name: text(sprint.name, 1000),
          state: sprint.state as "active" | "future",
          goal: text(sprint.goal, 20_000, true),
        };
      }),
    },
  };
}
export function readJiraTransitions(value: unknown): JiraMobileTransition[] {
  return list(value, 500).map((value) => {
    const row = record(value),
      id = text(row.id, 100);
    if (!/^\d+$/.test(id)) throw new Error("Invalid Jira transition");
    return {
      id,
      name: text(row.name, 1000),
      statusId: text(row.statusId, 100),
      requiresFields: bool(row.requiresFields),
    };
  });
}
export type JiraWriteOutcome =
  | { outcome: "submitted" }
  | { outcome: "not-submitted"; reason: string };
export function readJiraWriteOutcome(value: unknown): JiraWriteOutcome {
  const row = record(value);
  if (row.outcome === "submitted" && Object.keys(row).length === 1) return { outcome: "submitted" };
  if (row.outcome === "not-submitted" && Object.keys(row).length === 2)
    return { outcome: "not-submitted", reason: text(row.reason, 1000) };
  throw new Error("The Jira operation result is unconfirmed");
}
