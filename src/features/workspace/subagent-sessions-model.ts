import type { HostSessionSummary } from "@/domain/types";
import { decodeDelegationParent, DELEGATION_PARENT_KEY, type DelegationParent } from "../../../../src/shared/model/host-contracts/delegation";
import type { AgentEntry } from "./agents-model";

/** A delegated run that is its own session, so it opens as a session route rather than an in-sheet view. */
export type ChildSessionEntry = {
  sessionId: string;
  projectId: string;
  title: string;
  kind: DelegationParent["kind"];
  state: AgentEntry["state"];
  startedAt: number;
  /** Provider and model, e.g. "codex · gpt-5". */
  meta: string;
};

const stateOf = (row: HostSessionSummary): AgentEntry["state"] =>
  row.status === "running" ? "running" : row.issue === "failed" ? "failed" : "completed";

/**
 * Children of one parent from a project session list, oldest first. Older Hosts omit
 * `delegationParent`, which yields an empty list and keeps the in-sheet details only.
 */
export function childSessions(rows: readonly HostSessionSummary[] | undefined, parentId: string): ChildSessionEntry[] {
  const children: ChildSessionEntry[] = [];
  for (const row of rows ?? []) {
    const link = row.delegationParent;
    if (!link || link.parentSessionId !== parentId || row.id === parentId) continue;
    children.push({
      sessionId: row.id,
      projectId: row.projectId,
      title: row.title?.trim() || (link.kind === "advisor" ? "Advisor" : "Subagent"),
      kind: link.kind,
      state: stateOf(row),
      startedAt: link.startedAt,
      meta: [row.harness, (row.model || link.model).replace(/^[^:]+:/, "")].filter(Boolean).join(" · "),
    });
  }
  return children.sort((a, b) => a.startedAt - b.startedAt);
}

/** The parent link of an open child session: from the summary, else from its settings. */
export function parentLinkOf(session: { delegationParent?: DelegationParent | null; modelSettings?: Record<string, string> } | undefined): DelegationParent | undefined {
  if (!session) return undefined;
  return session.delegationParent ?? decodeDelegationParent(session.modelSettings?.[DELEGATION_PARENT_KEY]);
}
