import { View } from "react-native";
import Pin from "lucide-react-native/icons/pin";
import GitBranch from "lucide-react-native/icons/git-branch";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import { Badge, Body, IconButton, PressableCard, Row } from "@/ui/primitives";
import { ProviderIcon } from "@/ui/provider-identity";
import { decorativeSvgProps } from "@/ui/accessibility";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { colors, metrics, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { HostSessionSummary } from "./wire";
import { sessionStatus } from "./shared";
import { SessionRowActions } from "./session-row-actions";

/** One compact conversation identity; navigation and secondary actions remain separate targets. */
export function SessionListRow({
  machineId,
  projectId,
  projectName,
  projectCwd,
  session,
  ancestors,
  compressed,
  canRead,
  onPress,
}: {
  machineId: string;
  projectId: string;
  projectName?: string;
  projectCwd?: string;
  session: HostSessionSummary;
  ancestors?: readonly string[];
  compressed?: boolean;
  canRead: () => boolean;
  onPress: () => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const title = session.title || copy("Yeni oturum", "New session");
  const status = sessionStatus({ ...session, pinned: false }, copy);
  const context = [projectName, compressed ? ancestors?.at(-1) : undefined]
    .filter(Boolean)
    .join(" · ");
  const label = [
    title,
    projectName,
    status.label,
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
      canRead={canRead}
    >
      {(openActions) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <PressableCard
            label={label}
            onPress={onPress}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: metrics.touchTarget,
              padding: space.sm,
              gap: space.xs,
              borderWidth: 0,
              borderRadius: radii.control,
              backgroundColor: colors.panel,
            }}
          >
            <Row style={{ justifyContent: "space-between", gap: space.xs }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  minWidth: 0,
                  gap: space.xs,
                }}
              >
                {session.pinned ? (
                  <Pin {...decorativeSvgProps} size={12} color={colors.muted} />
                ) : null}
                {context ? (
                  <Body
                    selectable={false}
                    muted
                    numberOfLines={1}
                    style={[uiStyles.caption, { flex: 1 }]}
                  >
                    {context}
                  </Body>
                ) : null}
              </View>
              <Badge
                label={status.label}
                tone={
                  session.needsInput || session.status === "interrupted"
                    ? "warning"
                    : session.status === "running"
                      ? "live"
                      : "default"
                }
              />
            </Row>
            <Body selectable={false} numberOfLines={1} style={uiStyles.title}>
              {title}
            </Body>
            <Row style={{ flexWrap: "nowrap", justifyContent: "space-between", gap: space.sm }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  minWidth: 0,
                  gap: space.xs,
                }}
              >
                {session.branch ? (
                  <GitBranch {...decorativeSvgProps} size={12} color={colors.muted} />
                ) : null}
                <Body
                  selectable={false}
                  muted
                  numberOfLines={1}
                  style={[uiStyles.caption, { flex: 1 }]}
                >
                  {session.branch}
                </Body>
              </View>
              <ProviderIcon provider={session.harness} size={16} />
            </Row>
          </PressableCard>
          <IconButton
            label={copy("Oturum seçenekleri", "Session options")}
            density="compact"
            onPress={openActions}
          >
            <Ellipsis size={18} color={colors.muted} />
          </IconButton>
        </View>
      )}
    </SessionRowActions>
  );
}
