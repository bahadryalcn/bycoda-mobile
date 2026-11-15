import { useSessionDraftPresence } from "./use-session-draft-presence";
import { memo, useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import GitBranch from "lucide-react-native/icons/git-branch";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import CircleDot from "lucide-react-native/icons/circle-dot";
import Bot from "lucide-react-native/icons/bot";
import { Body, PressableCard, StatusText } from "@/ui/primitives";
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
import { sessionActivityAt } from "./session-collection";
import { sessionDisplayTitle } from "./session-title";
import { providerName } from "./provider-choices";
import { sessionModelLabel } from "./catalog";
import { observeSessionRuns, openSessionSeen, useUnseenDone } from "./session-done-store";
import { sessionRowKind } from "./session-row-state";

const statusTone = {
  failed: "danger",
  retrying: "warning",
  interrupted: "warning",
  input: "warning",
  working: "live",
  waiting: "default",
  done: "success",
  idle: "default",
} as const;

/** One compact conversation identity; secondary actions live in swipe and long-press. */
export const SessionListRow = memo(function SessionListRow({
  machineId,
  projectId,
  projectName,
  projectCwd,
  projectAppearance,
  showProject,
  session,
  ancestors,
  compressed,
  canRead,
  settled,
  onPress,
}: {
  machineId: string;
  projectId: string;
  projectName?: string;
  projectCwd?: string;
  projectAppearance?: HostProject["appearance"];
  /** All-session views name the project in the meta line; a project's own list does not. */
  showProject?: boolean;
  session: HostSessionSummary;
  ancestors?: readonly string[];
  compressed?: boolean;
  canRead: (projectId: string) => boolean;
  /** The Host marks this session settled (shown in the collapsed Settled group). */
  settled?: boolean;
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
  const title = sessionDisplayTitle(session.title, copy("Yeni oturum", "New session"));
  const running = session.status === "running";
  // Run transitions are observed where the row sees them; a finish while away turns Done.
  useEffect(() => {
    observeSessionRuns(machineId, [{ id: session.id, status: running ? "running" : "idle" }]);
  }, [machineId, session.id, running]);
  const done = useUnseenDone(machineId, session.id);
  const kind = sessionRowKind(session, done);
  const status = sessionStatus({ ...session, pinned: false }, copy, colors, done);
  const stamp =
    kind !== "idle" ? (
      <StatusText label={status.label} tone={statusTone[kind]} />
    ) : (
      <Body selectable={false} muted style={uiStyles.caption}>
        {relativeTime(sessionActivityAt(session), copy)}
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
    managedLabel,
    projectName,
    status.label,
    hasDraft ? draftLabel : undefined,
    session.pinned ? copy("Sabit", "Pinned") : undefined,
    ancestors?.join(" / "),
    session.model ? sessionModelLabel({ harness: session.harness, model: session.model }) : providerName(session.harness),
    session.branch
      ? `${worktree ? copy("Ayrı çalışma klasörü", "Worktree") : copy("Dal", "Branch")}: ${session.branch}`
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
            optionsLabel={optionsLabel}
            onPress={() => {
              openSessionSeen(machineId, session.id);
              onPress(session.id, projectId);
            }}
            onLongPress={openActions}
            style={{
              minHeight: metrics.rowHeightSession,
              justifyContent: "center",
              paddingVertical: space.row,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "flex-start",
                gap: space.row,
              }}
            >
              <View style={{ paddingTop: space.xxs, flexShrink: 0 }}>
                <ProviderIcon provider={session.harness} size={20} />
              </View>
              <View style={{ flex: 1, minWidth: 120, gap: space.xxs }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
                  <Body
                    selectable={false}
                    numberOfLines={fontScale > 1 ? undefined : 2}
                    style={[uiStyles.label, { fontWeight: "600", flexShrink: 1 }]}
                  >
                    {title}
                  </Body>
                  {managedLabel ? (
                    <View style={{ paddingTop: space.xxs }}>
                      <Bot {...decorativeSvgProps} size={14} color={colors.info} />
                    </View>
                  ) : null}
                </View>
                {showProject ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2 }}>
                    <ProjectIcon appearance={projectAppearance} size={14} box={16} />
                    <Body
                      selectable={false}
                      muted
                      numberOfLines={fontScale > 1 ? undefined : 1}
                      style={[uiStyles.caption, { flex: 1, minWidth: 0 }]}
                    >
                      {projectName}
                    </Body>
                  </View>
                ) : null}
                {meta || workItem ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2 }}>
                    {session.branch ? (
                      <BranchIcon {...decorativeSvgProps} size={12} color={colors.muted} />
                    ) : null}
                    <Body
                      selectable={false}
                      muted
                      numberOfLines={fontScale > 1 ? undefined : 1}
                      style={[uiStyles.caption, { flex: 1, minWidth: 0 }]}
                    >
                      {meta}
                    </Body>
                    {workItem ? (
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: space.xxs, flexShrink: 0 }}
                      >
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
              <View style={{ flexShrink: 0, alignItems: "flex-end", gap: space.xs }}>
                {stamp}
                {hasDraft ? (
                  <Body selectable={false} muted style={uiStyles.caption}>
                    {draftLabel}
                  </Body>
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
