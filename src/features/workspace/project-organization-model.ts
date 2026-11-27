export type OrganizationSnapshot = {
  environmentId: string;
  sourceSessionId: string;
  projectCwd: string;
  workingCwd: string;
  revision: string;
  atomic: false;
  name: string;
  customName: string;
  groupId: string | null;
  groups: { id: string; name: string }[];
  projectPosition: number;
  projectCount: number;
  folders: {
    id: string;
    name: string;
    sessionIds: string[];
    parentId?: string;
    pinned?: boolean;
    collapsed: boolean;
    ordered?: boolean;
  }[];
  sessions: { id: string; title: string }[];
  order: { loose?: string[]; pinned?: string[] };
};
export type OrganizationStatus = {
  state: "unknown" | "applied" | "failed";
  snapshot?: OrganizationSnapshot;
  message?: string;
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, limit = 200): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= limit && !/[\0\r\n]/.test(value);
const stringIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 500 &&
  value.every((id) => text(id)) &&
  new Set(value).size === value.length;
export function readOrganization(
  value: unknown,
  environmentId: string,
  sourceSessionId: string,
): OrganizationSnapshot {
  if (
    !record(value) ||
    !exact(value, [
      "environmentId",
      "sourceSessionId",
      "projectCwd",
      "workingCwd",
      "revision",
      "atomic",
      "name",
      "customName",
      "groupId",
      "groups",
      "projectPosition",
      "projectCount",
      "folders",
      "sessions",
      "order",
    ]) ||
    value.environmentId !== environmentId ||
    value.sourceSessionId !== sourceSessionId ||
    value.atomic !== false ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    !text(value.projectCwd, 4096) ||
    !text(value.workingCwd, 4096) ||
    value.projectCwd.startsWith("remote://") ||
    value.workingCwd.startsWith("remote://") ||
    !text(value.name, 1000) ||
    typeof value.customName !== "string" ||
    value.customName.length > 1000 ||
    (value.groupId !== null && !text(value.groupId)) ||
    !Array.isArray(value.groups) ||
    value.groups.length > 500 ||
    !value.groups.every(
      (row) => record(row) && exact(row, ["id", "name"]) && text(row.id) && text(row.name, 1000),
    ) ||
    !Number.isInteger(value.projectPosition) ||
    !Number.isInteger(value.projectCount) ||
    Number(value.projectPosition) < 0 ||
    Number(value.projectPosition) >= Number(value.projectCount) ||
    Number(value.projectCount) > 500 ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > 500 ||
    !value.sessions.every(
      (row) =>
        record(row) &&
        exact(row, ["id", "title"]) &&
        text(row.id) &&
        typeof row.title === "string" &&
        row.title.length <= 1000,
    ) ||
    !Array.isArray(value.folders) ||
    value.folders.length > 500 ||
    !value.folders.every(
      (row) =>
        record(row) &&
        exact(row, ["id", "name", "sessionIds", "parentId", "pinned", "collapsed", "ordered"]) &&
        text(row.id) &&
        text(row.name, 1000) &&
        stringIds(row.sessionIds) &&
        typeof row.collapsed === "boolean" &&
        (row.parentId === undefined || text(row.parentId)) &&
        (row.pinned === undefined || typeof row.pinned === "boolean") &&
        (row.ordered === undefined || typeof row.ordered === "boolean"),
    ) ||
    !record(value.order) ||
    !exact(value.order, ["loose", "pinned"]) ||
    Object.values(value.order).some((order) => !stringIds(order))
  )
    throw new Error("Invalid canonical project organization");
  const sessions = new Set(value.sessions.map((row) => row.id));
  const folders = new Set(value.folders.map((row) => row.id));
  const groups = new Set(value.groups.map((row) => row.id));
  if (
    sessions.size !== value.sessions.length ||
    folders.size !== value.folders.length ||
    groups.size !== value.groups.length ||
    (value.groupId !== null && !groups.has(value.groupId)) ||
    value.folders.some(
      (row) =>
        row.sessionIds.some((id: string) => !sessions.has(id)) ||
        (row.parentId !== undefined && !folders.has(row.parentId)),
    ) ||
    Object.values(value.order).some((ids) => (ids as string[]).some((id) => !sessions.has(id)))
  )
    throw new Error("Organization contains foreign identities");
  return value as OrganizationSnapshot;
}
export function readOrganizationStatus(
  value: unknown,
  environmentId: string,
  sourceSessionId: string,
): OrganizationStatus {
  if (
    !record(value) ||
    !exact(value, ["state", "snapshot", "message"]) ||
    typeof value.state !== "string" ||
    !["unknown", "applied", "failed"].includes(value.state) ||
    (value.message !== undefined &&
      (typeof value.message !== "string" || value.message.length > 500))
  )
    throw new Error("Invalid organization receipt");
  const snapshot =
    value.snapshot === undefined
      ? undefined
      : readOrganization(value.snapshot, environmentId, sourceSessionId);
  if (value.state === "applied" && !snapshot)
    throw new Error("Organization receipt has no current snapshot");
  return {
    state: value.state as OrganizationStatus["state"],
    ...(snapshot ? { snapshot } : {}),
    ...(typeof value.message === "string" ? { message: value.message } : {}),
  };
}
export function moveOrganizationId(ids: string[], id: string, step: number) {
  const at = ids.indexOf(id),
    to = at + step;
  if (at < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
export function validateOrganizationChange(
  snapshot: OrganizationSnapshot,
  change: Record<string, unknown>,
) {
  const knownSession = (id: unknown) => text(id) && snapshot.sessions.some((row) => row.id === id);
  const knownFolder = (id: unknown) => text(id) && snapshot.folders.some((row) => row.id === id);
  if (
    ["projectName", "groupName", "folderName", "folderCreate"].includes(String(change.kind)) &&
    (typeof change.name !== "string" ||
      change.name.trim().length > 160 ||
      (change.kind !== "projectName" && !change.name.trim()) ||
      /[\0\r\n]/.test(change.name))
  )
    throw new Error("Enter a valid display name");
  if (
    change.kind === "folderCreate" &&
    (!stringIds(change.sessionIds) ||
      !change.sessionIds.length ||
      !change.sessionIds.every(knownSession) ||
      (change.parentId !== undefined && !knownFolder(change.parentId)))
  )
    throw new Error("Select sessions and a valid parent folder");
  if (
    change.kind === "sessionMove" &&
    (!knownSession(change.sessionId) || (change.folderId !== null && !knownFolder(change.folderId)))
  )
    throw new Error("Select a session and destination");
  if (
    change.kind === "projectGroup" &&
    change.groupId !== null &&
    !snapshot.groups.some((row) => row.id === change.groupId)
  )
    throw new Error("Select an available group");
  if (
    ["folderName", "folderMove", "folderSessions"].includes(String(change.kind)) &&
    !knownFolder(change.folderId)
  )
    throw new Error("Select a current project folder");
  if (change.kind === "folderMove") {
    if (!record(change.target)) throw new Error("Select a folder destination");
    const target = change.target;
    if (target.kind === "into") {
      let at = snapshot.folders.find((row) => row.id === target.id);
      const seen = new Set<string>();
      if (!at) throw new Error("Select a parent folder");
      while (at && !seen.has(at.id)) {
        if (at.id === change.folderId) throw new Error("A folder cannot be moved inside itself");
        seen.add(at.id);
        at = snapshot.folders.find((row) => row.id === at!.parentId);
      }
    }
  }
  if (
    ["sessionOrder", "folderSessions"].includes(String(change.kind)) &&
    (!stringIds(change.sessionIds) || !change.sessionIds.every(knownSession))
  )
    throw new Error("Session order contains an unavailable item");
  if (
    change.kind === "folderOrder" &&
    (!stringIds(change.folderIds) || !change.folderIds.every(knownFolder))
  )
    throw new Error("Folder order contains an unavailable item");
  return change;
}
