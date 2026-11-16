import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Chip } from "panelui-native/components/chip";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Users from "lucide-react-native/icons/users";
import { Body } from "@/ui/typography";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";
import type { HostSession } from "./wire";
import { useHostClient, useHostQuery } from "@/state/queries";
import type { HostSessionSummary } from "@/domain/types";
import { childSessions } from "./subagent-sessions-model";
import { agentCounts, listAgents } from "./agents-model";
import { runStatus } from "./run-status-model";
import { AgentsSheet } from "./agents-sheet";
import { RunStatusCard } from "./run-status-card";
import type { TranscriptBlockProps } from "./session-types";

type Props = Pick<TranscriptBlockProps, "scope" | "disabled" | "onCommand"> & {
  session: HostSession | undefined;
  /** Operating controls rendered beside the queue above the composer. */
  children: (chip: ReactNode) => ReactNode;
};

/** Run controls and the Agents sheet retain their existing access-aware owners. */
export function SessionAgents({ session, children: operations, ...props }: Props) {
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
  // Child sessions may be created without an inline agent block. Discover them while working,
  // sharing the sessions-panel cache and its access-aware foreground-only query owner.
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId], "sessions.list", { projectId }, {
    enabled: !!projectId && (live || open || agentBlocks.length > 0),
    interval: live ? 4000 : undefined,
  });
  const children = useMemo(() => childSessions(siblings.data, scope.sessionId), [siblings.data, scope.sessionId]);
  const counts = agentCounts(agentBlocks);
  counts.total += children.length;
  counts.running = runStatus(blocks ?? [], live).subagents.running + children.filter((child) => child.state === "running").length;
  const label = live && counts.running
    ? copy("{p0}/{p1} ajan çalışıyor", "{p0}/{p1} agents running", { p0: counts.running, p1: counts.total })
    : copy("{p0} ajan", "{p0} agents", { p0: counts.total });
  const chip = counts.total ? (
        <Chip
          accessibilityLabel={label}
          onPress={() => setOpen(true)}
          className="min-h-12 h-auto"
          style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.row, alignSelf: "flex-start", flexShrink: 1, maxWidth: "100%", marginHorizontal: 0, paddingVertical: 0, paddingHorizontal: space.lg, borderRadius: radii.pill, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.separator }}
        >
          <Users size={14} color={colors.tertiary} />
          <Body style={{ flexShrink: 1, fontSize: fontSize.control, lineHeight: lineHeight.control }}>{label}</Body>
          <ChevronRight size={16} color={colors.tertiary} />
        </Chip>
  ) : null;
  return (
    <>
      {operations(<><RunStatusCard blocks={blocks} live={live} onOpenAgents={() => setOpen(true)} />{chip}</>)}
      {open ? <View><AgentsSheet blocks={blocks} childRuns={children} onClose={() => setOpen(false)} {...props} runId={session?.runId} parentProvider={session?.session.harness} context={context} /></View> : null}
    </>
  );
}
