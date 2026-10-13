import { View } from "react-native";
import { useState } from "react";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Square from "lucide-react-native/icons/square";
import { router } from "expo-router";
import { Badge, Body, NavigationGroup, NavigationRow, Row, Sheet } from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import type { SessionToolbarProps } from "./session-types";
import { SessionArtifacts } from "./session-artifacts";
import { ChatAction } from "@/ui/chat-controls";

export function SessionToolbar({
  scope,
  projectId,
  query,
  command,
  blocked,
  onSettings,
  onRefresh,
  onCommand,
}: SessionToolbarProps) {
  const copy = useCopy();
  const session = query.data;
  const [menu, setMenu] = useState(false);
  const status = !session
    ? query.error
      ? copy("Durum yüklenemedi", "Status unavailable")
      : copy("Yükleniyor", "Loading")
    : session.session.pendingQuestion
      ? copy("Yanıt bekleniyor", "Awaiting answer")
      : session.status === "running"
        ? copy("Çalışıyor", "Running")
        : session.status === "interrupted"
          ? copy("Durduruldu", "Interrupted")
          : copy("Hazır", "Ready");

  const openProject = () => {
    if (!projectId) return;
    router.push({
      pathname: "/project/[id]",
      params: {
        id: projectId,
        machineId: scope.machineId,
        ...(session?.session.worktreeCwd ? { cwd: session.session.worktreeCwd } : {}),
      },
    });
  };

  return (
    <View
      style={{ borderBottomWidth: 1, borderBottomColor: colors.separator, paddingBottom: space.xs }}
    >
      <Row style={{ flexWrap: "nowrap", gap: space.sm }}>
        <Row style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Badge
            label={status}
            tone={
              !session && query.error
                ? "danger"
                : session?.session.pendingQuestion || session?.status === "interrupted"
                  ? "warning"
                  : session?.status === "running"
                    ? "active"
                    : undefined
            }
          />
          <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>
            {session
              ? [session.session.harness, session.session.model.replace(/^[^:]+:/, "")].join(" · ")
              : ""}
          </Body>
        </Row>
        {session?.status === "running" && session.runId ? (
          <ChatAction
            label={copy("Durdur", "Stop")}
            busy={command.isPending}
            disabled={blocked}
            onPress={() => {
              void onCommand({
                type: "cancel",
                sessionId: scope.sessionId,
                runId: session.runId,
              }).catch(() => {});
            }}
          >
            <Square size={18} color={colors.danger} />
          </ChatAction>
        ) : null}
        <ChatAction
          label={copy("Oturum seçenekleri", "Session options")}
          onPress={() => setMenu(true)}
        >
          <Ellipsis size={20} color={colors.muted} />
        </ChatAction>
      </Row>
      <Sheet
        size="compact"
        visible={menu}
        title={copy("Oturum seçenekleri", "Session options")}
        onClose={() => setMenu(false)}
      >
        <NavigationGroup>
          <NavigationRow
            label={copy("Oturum ayarları", "Session settings")}
            onPress={() => {
              setMenu(false);
              onSettings();
            }}
          />
          <NavigationRow
            label={copy("Yenile", "Refresh")}
            disabled={query.isFetching}
            onPress={() => {
              setMenu(false);
              onRefresh();
            }}
          />
          {projectId ? (
            <NavigationRow
              label={copy("Proje", "Project")}
              onPress={() => {
                setMenu(false);
                openProject();
              }}
            />
          ) : null}
        </NavigationGroup>
        {projectId ? <SessionArtifacts projectId={projectId} sessionId={scope.sessionId} /> : null}
      </Sheet>
    </View>
  );
}
