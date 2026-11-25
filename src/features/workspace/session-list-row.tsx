import { sessionIsSnoozed } from "./session-attention-model";
import { useClockLabel } from "./session-clock";
import { stamp as dateStamp } from "../management/shared/format";
import { useSessionDraftPresence } from "./use-session-draft-presence";
import { memo, useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import GitBranch from "lucide-react-native/icons/git-branch";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import CircleDot from "lucide-react-native/icons/circle-dot";
import Bot from "lucide-react-native/icons/bot";
import Pin from "lucide-react-native/icons/pin";
import { Body, PressableCard } from "@/ui/primitives";
import { SessionRowStatus } from "./session-row-status";
import { sessionRowBadge } from "./session-row-status-model";
import { ProjectIcon } from "@/ui/project-icon";
import { ProviderIcon } from "@/ui/provider-identity";
import { decorativeSvgProps } from "@/ui/accessibility";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import type { HostProject } from "@/domain/types";
import type { HostSessionSummary } from "./wire";
import { relativeTime, sessionStatus } from "./shared";
import { SessionRowActions } from "./session-row-actions";
import { sessionActivityAt } from "./session-directory";
import { sessionDisplayTitle } from "./session-title";
import { providerName } from "./provider-choices";
import { sessionModelLabel } from "./catalog";
import { observeSessionRuns, openSessionSeen, useUnseenDone } from "./session-done-store";
import { sessionRowKind } from "./session-row-state";


/** One compact conversation identity; secondary actions live in swipe and long-press. */
export const SessionListRow = memo(function SessionListRow({
  machineId,
  projectId,
  projectName,
  projectCwd,
  projectAppearance,
  showProject,
  selected,
  session,
  ancestors,
  compressed,
  canRead,
  settled,
  snoozed = sessionIsSnoozed(session),
  onPress,
}: {
  machineId: string;
  projectId: string;
  projectName?: string;
  projectCwd?: string;
  projectAppearance?: HostProject["appearance"];
  /** All-session views name the project in the meta line; a project's own list does not. */
  showProject?: boolean;
  selected?: boolean;
  session: HostSessionSummary;
  ancestors?: readonly string[];
  compressed?: boolean;
  canRead: (projectId: string) => boolean;
  /** The Host marks this session settled (shown in the collapsed Settled group). */
  settled?: boolean;
  snoozed?: boolean;
  /** Receives the session id so the parent can pass one stable callback to every row. */
  onPress: (sessionId: string, projectId: string) => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const hasDraft = useSessionDraftPresence(
    machineId,
    session.id,
    canRead(projectId),
    session.draft,
  );
  const draftLabel = copy("Taslak", "Draft");
  const { fontScale } = useWindowDimensions();
  const large = fontScale > 1;
  const title = sessionDisplayTitle(session.title, copy("Yeni oturum", "New session"));
  const running = session.status === "running";
  // Run transitions are observed where the row sees them; a finish while away turns Done.
  useEffect(() => {
    observeSessionRuns(machineId, [{ id: session.id, status: running ? "running" : "idle" }]);
  }, [machineId, session.id, running]);
  const done = useUnseenDone(machineId, session.id);
  const kind = sessionRowKind(session, done);
  const status = sessionStatus({ ...session, pinned: false }, copy, colors, done);
  const badge = sessionRowBadge(kind, hasDraft);
  const activityAt = sessionActivityAt(session);
  // Only this row re-renders when its own label changes; the shared beat never touches siblings.
  const age = useClockLabel((now) => relativeTime(activityAt, copy, now));
  const stamp = badge ? (
    <SessionRowStatus
      label={kind === "idle" ? draftLabel : status.label}
      tone={badge.tone}
      icon={badge.icon}
    />
  ) : (
    <Body selectable={false} muted style={uiStyles.caption}>
      {age}
    </Body>
  );
  const optionsLabel = copy("Oturum seçenekleri", "Session options");
  const folder = compressed ? ancestors?.at(-1) : undefined;
  const meta = [showProject ? undefined : folder, session.branch].filter(Boolean).join(" · ");
  const worktree = !!session.branch && !!session.worktreeCwd;
  const BranchIcon = worktree ? FolderTree : GitBranch;
  const workItem = session.linkedWorkItem;
  const workItemLabel = workItem
    ? `${workItem.kind === "pr" ? copy("Pull request", "Pull request") : copy("Issue", "Issue")} #${workItem.number}`
    : undefined;
  const management = session.managedBy;
  const managedLabel =
    management?.assistant && management.detachedAt === undefined
      ? "supervisionId" in management
        ? copy("Denetim kaydedildi", "Supervision recorded")
        : copy("Yönetilen oturum", "Managed session")
      : undefined;
  const label = [
    title,
    session.unread ? copy("Okunmadı", "Unread") : undefined,
    managedLabel,
    projectName,
    status.label,
    hasDraft ? draftLabel : undefined,
    session.pinned ? copy("Sabitlendi", "Pinned") : undefined,
    ancestors?.join(" / "),
    session.model ? sessionModelLabel({ harness: session.harness, model: session.model }) : providerName(session.harness),
    session.branch
      ? `${worktree ? copy("Çalışma ağacı", "Worktree") : copy("Dal", "Branch")}: ${session.branch}`
      : undefined,
    workItemLabel,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <SessionRowActions
      machineId={machineId}
      projectId={projectId}
      projectName={projectName}
      projectCwd={projectCwd}
      session={session}
      settled={settled}
      canRead={() => canRead(projectId)}
    >
      {(openActions) => (
        <View>
          <PressableCard
            label={label}
            selected={selected}
            optionsLabel={optionsLabel}
            onPress={() => {
              if (!canRead(projectId)) return;
              openSessionSeen(machineId, session.id);
              onPress(session.id, projectId);
            }}
            onLongPress={openActions}
            style={{
              minHeight: metrics.rowHeightSession,
              justifyContent: "center",
              paddingVertical: space.row,
              backgroundColor: selected ? colors.selected : undefined,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.row }}>
              <View style={{ paddingTop: space.xxs, flexShrink: 0 }}>
                <ProviderIcon provider={session.harness} size={20} />
                {/* Unread marks the identity, so it never moves with a wrapping title. */}
                {session.unread ? (
                  <View accessible={false} style={{
                    position: "absolute", top: 0, end: -space.xxs, width: space.sm + space.xxs, height: space.sm + space.xxs,
                    borderRadius: space.sm, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.background,
                  }} />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
                {/* The stamp shares only the title line; meta lines below use the full width. */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
                    <Body
                      selectable={false}
                      numberOfLines={large ? undefined : 2}
                      style={[uiStyles.label, { fontWeight: session.unread ? "700" : "600", flexShrink: 1 }]}
                    >
                      {title}
                    </Body>
                    {session.pinned ? (
                      <View style={{ paddingTop: space.xxs }}>
                        <Pin {...decorativeSvgProps} size={13 * Math.min(fontScale, 1.6)} color={colors.muted} />
                      </View>
                    ) : null}
                    {managedLabel ? (
                      <View style={{ paddingTop: space.xxs }}>
                        <Bot {...decorativeSvgProps} size={14 * Math.min(fontScale, 1.6)} color={colors.info} />
                      </View>
                    ) : null}
                  </View>
                  {large ? null : <View style={{ flexShrink: 0, paddingTop: space.xxs }}>{stamp}</View>}
                </View>
                {large ? <View style={{ flexDirection: "row" }}>{stamp}</View> : null}
                {snoozed ? <Body muted style={uiStyles.caption}>{copy("Uyanma zamanı", "Wakes at")} · {dateStamp(session.snoozedUntil ?? undefined)}</Body> : null}
                {showProject || meta || workItem ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.xs + 2, rowGap: space.xxs }}>
                    {showProject ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
                        <ProjectIcon appearance={projectAppearance} size={14} box={16} />
                        <Body selectable={false} muted numberOfLines={large ? undefined : 1} style={[uiStyles.caption, { flexShrink: 1 }]}>
                          {projectName}
                        </Body>
                      </View>
                    ) : null}
                    {meta ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
                        {session.branch ? (
                          <BranchIcon {...decorativeSvgProps} size={12 * Math.min(fontScale, 1.6)} color={colors.muted} />
                        ) : null}
                        <Body selectable={false} muted numberOfLines={large ? undefined : 1} style={[uiStyles.caption, { flexShrink: 1 }]}>
                          {meta}
                        </Body>
                      </View>
                    ) : null}
                    {workItem ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs, flexShrink: 0 }}>
                        {workItem.kind === "pr" ? (
                          <GitPullRequest {...decorativeSvgProps} size={12} color={colors.muted} />
                        ) : (
                          <CircleDot {...decorativeSvgProps} size={12} color={colors.muted} />
                        )}
                        <Body selectable={false} muted style={uiStyles.caption}>
                          {`#${workItem.number}`}
                        </Body>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </PressableCard>
          <View accessible={false} style={uiStyles.separator} />
        </View>
      )}
    </SessionRowActions>
  );
});
