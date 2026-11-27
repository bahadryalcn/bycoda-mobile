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
  /** The child's own provider, for its avatar. */
  harness?: string;
  /** Raw model id the child runs, e.g. "claude:opus". */
  model?: string;
  /** Host-recorded end of the child's latest round; absent while it runs or on older Hosts. */
  endedAt?: number;
  /** The Host's failure line for a failed round. */
  error?: string;
  /** The Host's delegation run id, which the parent's delegate notices name. */
  runId?: string;
};

const stateOf = (row: HostSessionSummary, link: DelegationParent): AgentEntry["state"] =>
  row.status === "running" ? "running" : row.status === "interrupted" ? "interrupted"
    : row.issue === "failed" || link.status === "failed" ? "failed" : link.status === "cancelled" ? "stopped" : "completed";

/**
 * Children of one parent from a project session list, oldest first. Older Hosts omit
 * `delegationParent`, which yields an empty list and keeps the in-sheet details only.
 */
export function childSessions(
  rows: readonly HostSessionSummary[] | undefined,
  parentId: string,
  /** Titles of an untitled child, in the owner's language. */
  untitled: { advisor: string; subagent: string } = { advisor: "Advisor", subagent: "Subagent" },
): ChildSessionEntry[] {
  const children: ChildSessionEntry[] = [];
  for (const row of rows ?? []) {
    const link = row.delegationParent;
    if (!link || link.parentSessionId !== parentId || row.id === parentId) continue;
    children.push({
      sessionId: row.id,
      projectId: row.projectId,
      title: row.title?.trim() || (link.kind === "advisor" ? untitled.advisor : untitled.subagent),
      kind: link.kind,
      state: stateOf(row, link),
      startedAt: link.startedAt,
      meta: [row.harness, (row.model || link.model).replace(/^[^:]+:/, "")].filter(Boolean).join(" · "),
      harness: row.harness,
      model: row.model || link.model,
      ...(row.status !== "running" && link.finishedAt !== undefined ? { endedAt: link.finishedAt } : {}),
      ...(link.error?.trim() ? { error: link.error.trim() } : {}),
      ...(link.runId ? { runId: link.runId } : {}),
    });
  }
  return children.sort((a, b) => a.startedAt - b.startedAt);
}

/** The parent link of an open child session: from the summary, else from its settings. */
export function parentLinkOf(session: { delegationParent?: DelegationParent | null; modelSettings?: Record<string, string> } | undefined): DelegationParent | undefined {
  if (!session) return undefined;
  return session.delegationParent ?? decodeDelegationParent(session.modelSettings?.[DELEGATION_PARENT_KEY]);
}

/** The listed child a delegate notice's run id names; undefined for an empty or unknown id. */
export function childForRun(children: readonly ChildSessionEntry[], runId: string | undefined): ChildSessionEntry | undefined {
  return runId ? children.find((child) => child.runId === runId) : undefined;
}
