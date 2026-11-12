import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Users from "lucide-react-native/icons/users";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";
import type { HostSession } from "./wire";
import { useHostClient, useHostQuery } from "@/state/queries";
import type { HostSessionSummary } from "@/domain/types";
import { childSessions } from "./subagent-sessions-model";
import { agentCounts, listAgents } from "./agents-model";
import { AgentsSheet } from "./agents-sheet";
import { RunStatusCard } from "./run-status-card";
import type { TranscriptBlockProps } from "./session-types";

type Props = Pick<TranscriptBlockProps, "scope" | "disabled" | "onCommand"> & {
  session: HostSession | undefined;
  /** Renders the transcript; the idle "N agents" chip is handed over as its list header so it scrolls with the content. */
  children: (chip: ReactNode) => ReactNode;
};

/** Run status above the transcript plus the Agents sheet; an idle session that used subagents keeps an "N agents" chip. */
export function SessionAgents({ session, children: transcript, ...props }: Props) {
  const client = useHostClient();
  const { scope } = props;
  const blocks = session?.session.blocks;
  const live = session?.status === "running";
  const context = useMemo(() => client && session ? { client, machineId: scope.machineId, projectId: session.projectId, sessionId: scope.sessionId,
    cwd: session.session.worktreeCwd || session.session.cwd } : undefined,
  [client, scope.machineId, scope.sessionId, session?.projectId, session?.session.cwd, session?.session.worktreeCwd]);
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const projectId = session?.projectId;
  const agentBlocks = useMemo(() => listAgents(blocks), [blocks]);
  // Same key as the sessions panel, so the list is shared. Without subagent blocks it is only read
  // from the cache (never fetched on open); the sheet forces a fetch when it opens.
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId], "sessions.list", { projectId }, { enabled: !!projectId && (open || agentBlocks.length > 0) });
  const children = useMemo(() => childSessions(siblings.data, scope.sessionId), [siblings.data, scope.sessionId]);
  const counts = agentCounts(agentBlocks);
  counts.total += children.length;
  const chip = !live && counts.total ? (
        <PressableCard
          label={copy("Ajanlar ({p0})", "Agents ({p0})", { p0: counts.total })}
          onPress={() => setOpen(true)}
          style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: space.row, alignSelf: "flex-start", marginHorizontal: 0, paddingVertical: 0, paddingHorizontal: space.lg, borderRadius: radii.pill, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.separator }}
        >
          <Users size={14} color={colors.tertiary} />
          <Body style={{ fontSize: fontSize.control, lineHeight: lineHeight.control }}>{copy("{p0} ajan", "{p0} agents", { p0: counts.total })}</Body>
          <ChevronRight size={16} color={colors.tertiary} />
        </PressableCard>
  ) : null;
  return (
    <>
      <RunStatusCard blocks={blocks} live={live} onOpenAgents={() => setOpen(true)} />
      {transcript(chip)}
      {open ? <View><AgentsSheet blocks={blocks} childRuns={children} onClose={() => setOpen(false)} {...props} runId={session?.runId} parentProvider={session?.session.harness} context={context} /></View> : null}
    </>
  );
}
