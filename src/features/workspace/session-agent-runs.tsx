import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { HostSessionSummary } from "@/domain/types";
import { useHostClient, useHostQuery } from "@/state/queries";
import type { QueryLike } from "@/ui/query-presentation";
import { useCopy } from "@/ui/copy";
import { AgentsSheet } from "./agents-sheet";
import { listAgents } from "./agents-model";
import { delegationToolKind } from "./delegated-runs-model";
import { childListInterval, readChildSummaries } from "./session-children-read";
import { childSessions, type ChildSessionEntry } from "./subagent-sessions-model";
import { isLiveRun } from "./subagent-run-model";
import type { TranscriptBlockProps } from "./session-types";
import type { HostSession } from "./wire";

export type SessionAgentRuns = {
  /** Delegated child sessions of this session, oldest first. */
  children: readonly ChildSessionEntry[];
  /** The Host reports the run as running. */
  live: boolean;
  /** Opens the Agents sheet. */
  openAgents: () => void;
  /** The computer the children run on, for their session routes. */
  machineId: string;
};

/** The child read polls while the parent runs or any of its children still does. */
export const childListPolled = (live: boolean, childRunning: boolean) => live || childRunning;

const SessionAgentRunsContext = createContext<SessionAgentRuns | undefined>(undefined);
const NO_CHILDREN: readonly ChildSessionEntry[] = [];

/** The session's subagent data and sheet; undefined outside a session screen. */
export function useSessionAgentRuns(): SessionAgentRuns | undefined {
  return useContext(SessionAgentRunsContext);
}

type Props = Pick<TranscriptBlockProps, "scope" | "disabled" | "onCommand"> & {
  session: HostSession | undefined;
  children: ReactNode;
};

/**
 * One owner for a session's subagents above both the transcript and the composer: the scoped child
 * read (access-aware, foreground-only query owner) and the Agents sheet. The transcript rows, the
 * floating agents pill and the activity strip read the same children, so the read runs once.
 */
export function SessionAgentRunsProvider({ session, children, ...props }: Props) {
  const client = useHostClient();
  const copy = useCopy();
  const { scope } = props;
  const blocks = session?.session.blocks;
  const live = session?.status === "running";
  const projectId = session?.projectId;
  const [open, setOpen] = useState(false);
  // A run's full block is read at the session revision current when the read starts.
  const revision = useRef(session?.revision ?? 0);
  revision.current = session?.revision ?? 0;
  const getRevision = useCallback(() => revision.current, []);
  // A delegate's result turn is the only trace a bycoda-delegated child leaves in the transcript; without
  // it a reopened finished session never read its children and its agents disappeared.
  // Any `agents.*` call counts: an advisor's consult leaves a child session too.
  const hasAgents = useMemo(() => listAgents(blocks).length > 0 ||
    !!blocks?.some((block) => block.author?.kind === "delegation" || delegationToolKind(block) !== undefined), [blocks]);
  // Child sessions may be created without an inline agent block. Discover them while working with a
  // read scoped to this parent rather than the project list. The key stays under ["sessions", projectId],
  // so session writes still invalidate it.
  // A delegated child keeps working after its parent's turn ends (the parent is idle, "background"),
  // so the read keeps polling while any listed child still runs; otherwise it would read "running"
  // with a ticking clock until something else refreshed the list.
  const [childRunning, setChildRunning] = useState(false);
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId, "children", scope.sessionId], "sessions.list", { projectId, parentSessionId: scope.sessionId }, {
    enabled: !!projectId && (live || open || hasAgents),
    interval: childListPolled(live, childRunning) ? (rows) => childListInterval(rows, scope.sessionId, hasAgents || open) : undefined,
    queryFn: (client, signal) => readChildSummaries(client, projectId!, scope.sessionId, signal),
  });
  // An untitled child is named by its role in the owner's language.
  const advisorTitle = copy("Danışman", "Advisor"), subagentTitle = copy("Alt ajan", "Subagent");
  const rows = useMemo(() => childSessions(siblings.data, scope.sessionId, { advisor: advisorTitle, subagent: subagentTitle }),
    [siblings.data, scope.sessionId, advisorTitle, subagentTitle]);
  const anyChildRunning = rows.some((row) => isLiveRun(row.state));
  if (anyChildRunning !== childRunning) setChildRunning(anyChildRunning);
  const errorKind = (siblings.error as { kind?: string } | undefined)?.kind;
  // An auth or identity failure must not keep showing children read under the old authority.
  const visibleChildren = errorKind === "auth" || errorKind === "identity" ? NO_CHILDREN : rows;
  const value = useMemo<SessionAgentRuns>(() => ({ children: visibleChildren, live: !!live, openAgents: () => setOpen(true), machineId: scope.machineId }),
    [visibleChildren, live, scope.machineId]);
  const context = useMemo(() => client && session ? { client, machineId: scope.machineId, projectId: session.projectId, sessionId: scope.sessionId,
    cwd: session.session.worktreeCwd || session.session.cwd } : undefined,
  [client, scope.machineId, scope.sessionId, session?.projectId, session?.session.cwd, session?.session.worktreeCwd]);
  return (
    <SessionAgentRunsContext.Provider value={value}>
      {children}
      {open ? <View><AgentsSheet blocks={blocks} childRuns={rows} childrenQuery={siblings as QueryLike} live={!!live} onClose={() => setOpen(false)}
        {...props} runId={session?.runId} parentProvider={session?.session.harness} context={context} getRevision={getRevision} /></View> : null}
    </SessionAgentRunsContext.Provider>
  );
}
