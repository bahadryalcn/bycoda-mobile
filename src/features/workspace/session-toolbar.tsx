import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import { useState } from "react";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Square from "lucide-react-native/icons/square";
import { router } from "expo-router";
import { Body, NavigationGroup, NavigationRow, Row, Sheet } from "@/ui/primitives";
import { colors, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import type { SessionToolbarProps } from "./session-types";
import { SessionArtifacts } from "./session-artifacts";
import { ChatAction, ChatToolbarAction } from "@/ui/chat-controls";
import { SessionFiles } from "./session-files";
import { useSessionQueue } from "./use-session-queue";

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
  useMobileTheme();
  const copy = useCopy();
  const session = query.data;
  const [menu, setMenu] = useState(false);
  const queue = useSessionQueue(scope);
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

  const dotColor =
    !session && query.error
      ? colors.danger
      : session?.session.pendingQuestion || session?.status === "interrupted"
        ? colors.warning
        : session?.status === "running"
          ? colors.live
          : colors.muted;
  return (
    <View style={{ paddingBottom: space.xs }}>
      <Row style={{ flexWrap: "nowrap", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Row style={{ flexWrap: "nowrap", gap: space.xs }}>
          <View
            accessible
            accessibilityLabel={status}
            style={{
              width: 8,
              height: 8,
              borderRadius: radii.pill,
              backgroundColor: dotColor,
            }}
          />
          <Body style={[uiStyles.caption, { color: colors.text, fontWeight: "600", flexShrink: 1 }]}>
            {status}
          </Body>
          </Row>
          <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>
            {session
              ? [session.session.harness, session.session.model.replace(/^[^:]+:/, "")].join(" · ")
              : ""}
          </Body>
        </View>
        {session?.status === "running" && session.runId ? (
          <ChatToolbarAction
            label={copy("Durdur", "Stop")}
            tone="danger"
            busy={command.isPending}
            disabled={blocked}
            onPress={() => {
              // Pause durable follow-ups before stopping the exact active run.
              // A pause failure must not hide the session's primary Stop action.
              void (async () => {
                if (queue.supported) await queue.pause().catch(() => {});
                await onCommand({
                  type: "cancel",
                  sessionId: scope.sessionId,
                  runId: session.runId,
                });
              })().catch(() => {});
            }}
          >
            <Square size={14} strokeWidth={2.4} color={colors.danger} />
          </ChatToolbarAction>
        ) : null}
        {session ? <SessionFiles scope={scope} session={session} /> : null}
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
