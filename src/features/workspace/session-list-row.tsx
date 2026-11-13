import { useSessionDraftPresence } from "./use-session-draft-presence";
import { memo } from "react";
import { View, useWindowDimensions } from "react-native";
import GitBranch from "lucide-react-native/icons/git-branch";
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
import { sessionDisplayTitle } from "./session-title";

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
  const status = sessionStatus({ ...session, pinned: false }, copy, colors);
  const failed = session.issue === "failed" && session.status === "idle" && !session.needsInput;
  const attention = session.needsInput || session.status === "interrupted" || failed;
  const live = !attention && session.status === "running";
  const stamp =
    attention || live ? (
      <StatusText label={status.label} tone={failed ? "danger" : attention ? "warning" : "live"} />
    ) : (
      <Body selectable={false} muted style={uiStyles.caption}>
        {relativeTime(session.updatedAt, copy)}
      </Body>
    );
  const optionsLabel = copy("Oturum seçenekleri", "Session options");
  const folder = compressed ? ancestors?.at(-1) : undefined;
  const meta = [showProject ? undefined : folder, session.branch].filter(Boolean).join(" · ");
  const label = [
    title,
    projectName,
    status.label,
    hasDraft ? draftLabel : undefined,
    session.pinned ? copy("Sabit", "Pinned") : undefined,
    ancestors?.join(" / "),
    session.harness,
    session.branch,
    session.model,
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
            onPress={() => onPress(session.id, projectId)}
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
              <View style={{ flex: 1, minWidth: 120, gap: space.xxs }}>
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
                <Body
                  selectable={false}
                  numberOfLines={fontScale > 1 ? undefined : 2}
                  style={[uiStyles.label, { fontWeight: "700" }]}
                >
                  {title}
                </Body>
                {session.branch || folder ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2 }}>
                    {session.branch ? (
                      <GitBranch {...decorativeSvgProps} size={12} color={colors.muted} />
                    ) : null}
                    <Body
                      selectable={false}
                      muted
                      numberOfLines={fontScale > 1 ? undefined : 1}
                      style={[uiStyles.caption, { flex: 1, minWidth: 0 }]}
                    >
                      {meta}
                    </Body>
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
                <ProviderIcon provider={session.harness} size={18} />
              </View>
            </View>
          </PressableCard>
          <View accessible={false} style={uiStyles.separator} />
        </View>
      )}
    </SessionRowActions>
  );
});
