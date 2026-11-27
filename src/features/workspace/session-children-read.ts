import type { HostSessionSummary } from "@/domain/types";
import { RemoteHostError } from "@/remote/host-error";
import type { HostTransport } from "@/remote/host-transport";

/** Cadence while the Host answers only this parent's children (a handful of rows). */
const CHILD_POLL_MS = 4_000;
/** Cadence when the Host ignored the parent filter and sent the whole project list. */
const PROJECT_LIST_POLL_MS = 15_000;
/** Cadence while nothing shows this run delegating: a slow discovery read for children made without an agent block. */
const DISCOVERY_POLL_MS = 15_000;

/**
 * Children of one session, read as a scoped `sessions.list` instead of the whole project list.
 * A Host that rejects the unknown `parentSessionId` param answers the plain list as before;
 * `childSessions` still keeps only rows whose own `delegationParent` names this parent.
 */
export async function readChildSummaries(
  client: Pick<HostTransport, "request">,
  projectId: string,
  parentSessionId: string,
  signal: AbortSignal,
): Promise<HostSessionSummary[]> {
  try {
    return await client.request<HostSessionSummary[]>("sessions.list", { projectId, parentSessionId }, { signal });
  } catch (error) {
    // Only a Host-side rejection falls back; connection, access and identity failures keep their own handling.
    if (signal.aborted || !(error instanceof RemoteHostError) || error.kind !== "host") throw error;
    return client.request<HostSessionSummary[]>("sessions.list", { projectId }, { signal });
  }
}

/**
 * Poll cadence for the scoped child read. A run that shows no delegation and has no children yet
 * only discovers slowly. A row that is not this parent's child means an older
 * Host sent the whole project list, so the fast cadence would re-send every summary: slow down.
 */
export function childListInterval(
  rows: readonly HostSessionSummary[] | undefined,
  parentSessionId: string,
  /** The transcript shows agents or delegation; without it and with no children yet, only discover slowly. */
  delegating = true,
): number {
  if (!Array.isArray(rows)) return delegating ? CHILD_POLL_MS : DISCOVERY_POLL_MS;
  if (!delegating && !rows.some((row) => row.delegationParent?.parentSessionId === parentSessionId))
    return DISCOVERY_POLL_MS;
  return rows.every((row) => row.delegationParent?.parentSessionId === parentSessionId) ? CHILD_POLL_MS : PROJECT_LIST_POLL_MS;
}
