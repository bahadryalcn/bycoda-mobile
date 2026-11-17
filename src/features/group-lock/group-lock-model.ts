import type { HostProjectDirectory } from "@/domain/types";

/** The Host offers phone unlocking only while a desktop window can verify the password. */
export const GROUP_LOCK_CAPABILITY = "projects.groupLock.remote.v1";
/** Covers the relay through the desktop heartbeat, which can take several seconds. */
export const GROUP_LOCK_TIMEOUT_MS = 30_000;
/** Part of the Host's stable "desktop unavailable" refusal; the transport keeps only the message. */
const UNAVAILABLE_MARKER = "Open the bycoda app on that computer";

export const supportsGroupLock = (capabilities: readonly string[] | undefined): boolean =>
  capabilities?.includes(GROUP_LOCK_CAPABILITY) === true;

/** What a password attempt came to. Anything but `ok` grants nothing. */
export type PasswordOutcome =
  | { state: "ok" }
  | { state: "wrong"; retryAfterMs: number }
  | { state: "throttled"; retryAfterMs: number }
  | { state: "unavailable" }
  | { state: "failed" };

const MAX_RETRY_MS = 24 * 60 * 60_000;
const retryAfter = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(MAX_RETRY_MS, Math.ceil(value))
    : 0;

/** Trusts only the three verdicts; a malformed answer is a failure, never a success. */
export function parsePasswordResult(value: unknown): PasswordOutcome {
  const result = (value as { result?: unknown } | null)?.result;
  const wait = retryAfter((value as { retryAfterMs?: unknown } | null)?.retryAfterMs);
  if (result === "ok") return { state: "ok" };
  if (result === "wrong") return { state: "wrong", retryAfterMs: wait };
  if (result === "throttled") return { state: "throttled", retryAfterMs: wait };
  return { state: "failed" };
}

export function passwordOutcomeFromError(error: unknown): PasswordOutcome {
  return error instanceof Error && error.message.includes(UNAVAILABLE_MARKER)
    ? { state: "unavailable" }
    : { state: "failed" };
}

type DirectoryGroup = HostProjectDirectory["groups"][number];
type LockedStub = NonNullable<HostProjectDirectory["lockedGroups"]>[number];

export type GroupLockView = {
  /** Locked groups, name only. */
  locked: LockedStub[];
  /** Open groups this phone unlocked, which it can lock again. */
  unlocked: DirectoryGroup[];
  /** Hidden groups; `undefined` until the hidden-list password was accepted. */
  hidden: NonNullable<HostProjectDirectory["hiddenGroups"]> | undefined;
  /** Groups that can be hidden once the hidden list is open. */
  hideable: DirectoryGroup[];
};

/** `granted` is what this phone unlocked; a group the Host closed again drops out on its own. */
export function groupLockView(
  directory: Pick<HostProjectDirectory, "groups" | "lockedGroups" | "hiddenGroups"> | undefined,
  granted: ReadonlySet<string>,
): GroupLockView {
  const groups = directory?.groups ?? [];
  return {
    locked: directory?.lockedGroups ?? [],
    unlocked: groups.filter((group) => granted.has(group.id)),
    hidden: directory?.hiddenGroups,
    hideable: groups,
  };
}

/**
 * The directory as it reads once these groups are locked: their projects and rows are
 * gone and each group is a name-only stub, so nothing waits on the Host's answer to conceal.
 */
export function withGroupsLocked(
  directory: HostProjectDirectory,
  groupIds: ReadonlySet<string>,
): HostProjectDirectory {
  const closed = directory.groups.filter((group) => groupIds.has(group.id));
  if (!closed.length) return directory;
  return {
    ...directory,
    groups: directory.groups.filter((group) => !groupIds.has(group.id)),
    projects: directory.projects.filter((project) => !project.groupId || !groupIds.has(project.groupId)),
    lockedGroups: [
      ...(directory.lockedGroups ?? []),
      ...closed.map(({ id, name, color, appearance }) => ({
        id,
        name,
        ...(color ? { color } : {}),
        ...(appearance ? { appearance } : {}),
      })),
    ],
  };
}

type CachedQuery = { queryKey: readonly unknown[]; state: { data: unknown } };

/**
 * Whether a cached query holds data of one of these projects: its key names the project, or
 * its payload says so. Sessions are cached by session id, so the payload's `projectId` counts.
 */
export function cacheHoldsProject(
  query: CachedQuery,
  machineId: string,
  projectIds: ReadonlySet<string>,
): boolean {
  const key = query.queryKey;
  if (key[0] !== "machine" || key[1] !== machineId || key[2] === "projects") return false;
  if (key.some((part) => typeof part === "string" && projectIds.has(part))) return true;
  if (JSON.stringify(key.slice(2), (_name, part) => (typeof part === "function" ? undefined : part)).split('"').some((part) => projectIds.has(part)))
    return true;
  const data = query.state.data as Record<string, unknown> | unknown[] | undefined;
  const sample = Array.isArray(data) ? data.slice(0, 5) : [data];
  return sample.some((entry) => {
    const row = entry as { projectId?: unknown; session?: { projectId?: unknown } } | null | undefined;
    const id = row?.projectId ?? row?.session?.projectId;
    return typeof id === "string" && projectIds.has(id);
  });
}

/** Seconds to show for a wait, rounded up so "try again" never arrives early. */
export const retrySeconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));
