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
import { SessionCheckpoints } from "./session-checkpoints";
import { SessionNotes } from "./session-notes";
import { HandoffSession } from "./handoff-session";
import { SessionBrowser } from "./session-browser";
import { WorktreeRemoval } from "./worktree-removal";
import { SshWorkspace } from "../tools/ssh-workspace";
import { HistoryImport } from "./history-import";
import { ProjectOrganization } from "./project-organization";
import { DesktopPreferences } from "./desktop-preferences";
import { MobilePty } from "../tools/mobile-pty";
import { ProviderDesktop } from "../tools/provider-desktop";

export function SessionToolbar({
  scope,
  projectId,
  query,
  blocked,
  onSettings,
  onRefresh,
  onCommand,
}: SessionToolbarProps) {
  useMobileTheme();
  const copy = useCopy();
  const session = query.data;
  const [menu, setMenu] = useState(false);
  const [review, setReview] = useState(false);
  const [notes, setNotes] = useState(false);
  const [browser, setBrowser] = useState(false);
  const [worktreeRemoval, setWorktreeRemoval] = useState(false);
  const [sshWorkspace, setSshWorkspace] = useState(false);
  const [historyImport, setHistoryImport] = useState(false);
  const [organization, setOrganization] = useState(false);
  const [desktopPreferences, setDesktopPreferences] = useState(false);
  const [mobilePty,setMobilePty]=useState(false);
  const [providerDesktop, setProviderDesktop] = useState(false);
  const [contextual, setContextual] = useState<"handoff" | "secondOpinion" | null>(null);
  const [stopping, setStopping] = useState(false);
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
            busy={stopping}
            disabled={blocked}
            onPress={() => {
              // Pause durable follow-ups before stopping the exact active run.
              // A pause failure must not hide the session's primary Stop action.
              void (async () => {
                setStopping(true);
                try {
                  if (queue.supported) await queue.pause().catch(() => {});
                  await onCommand({
                    type: "cancel",
                    sessionId: scope.sessionId,
                    runId: session.runId,
                  });
                } finally {
                  setStopping(false);
                }
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
          {session ? <NavigationRow label={copy("Bağlamlı agent devri", "Contextual handoff")} disabled={blocked || session.status === "running"}
            onPress={() => { setMenu(false); setContextual("handoff"); }} /> : null}
          {session ? <NavigationRow label={copy("İkinci görüş", "Second opinion")} disabled={blocked || session.status === "running"}
            onPress={() => { setMenu(false); setContextual("secondOpinion"); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Oturum notları", "Session notes")} disabled={blocked}
            onPress={() => { setMenu(false); setNotes(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Konuşma geçmişini içe aktar", "Import conversation history")} disabled={blocked}
            onPress={() => { setMenu(false); setHistoryImport(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Etkileşimli terminal", "Interactive terminal")} disabled={blocked} onPress={()=>{setMenu(false);setMobilePty(true);}}/>:null}
          {projectId && session ? <NavigationRow label={copy("Bilgisayar tercihleri", "Computer preferences")} disabled={blocked} onPress={() => { setMenu(false); setDesktopPreferences(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Proje organizasyonu", "Project organization")} disabled={blocked}
            onPress={() => { setMenu(false); setOrganization(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Hesaplar ve MCP", "Accounts and MCP")} disabled={blocked}
            onPress={() => { setMenu(false); setProviderDesktop(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Tarayıcı", "Browser")} disabled={blocked}
            onPress={() => { setMenu(false); setBrowser(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Çalışma klasörü kaldırma", "Worktree removal")} disabled={blocked}
            onPress={() => { setMenu(false); setWorktreeRemoval(true); }} /> : null}
          {projectId && session ? <NavigationRow label={copy("Bilgisayarda SSH", "SSH on the computer")} disabled={blocked}
            onPress={() => { setMenu(false); setSshWorkspace(true); }} /> : null}
          <NavigationRow label={copy("Oturum incelemesi", "Session review")} disabled={blocked}
            onPress={() => { setMenu(false); setReview(true); }} />
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
      {review && session ? <SessionCheckpoints scope={scope} session={session} blocked={blocked} onCommand={onCommand} onRefresh={onRefresh} onClose={() => setReview(false)} /> : null}
      {notes && projectId ? <SessionNotes key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setNotes(false)} /> : null}
      {browser && projectId ? <SessionBrowser key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setBrowser(false)} /> : null}
      {worktreeRemoval && projectId ? <WorktreeRemoval key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setWorktreeRemoval(false)} /> : null}
      {sshWorkspace && projectId ? <SshWorkspace key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setSshWorkspace(false)} /> : null}
      {historyImport && projectId ? <HistoryImport key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setHistoryImport(false)} /> : null}
      {mobilePty&&projectId?<MobilePty key={JSON.stringify([scope.machineId,projectId,scope.sessionId])} scope={scope} projectId={projectId} onClose={()=>setMobilePty(false)}/>:null}
      {desktopPreferences && projectId ? <DesktopPreferences key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setDesktopPreferences(false)} /> : null}
      {organization && projectId ? <ProjectOrganization key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setOrganization(false)} /> : null}
      {providerDesktop && projectId ? <ProviderDesktop key={JSON.stringify([scope.machineId, projectId, scope.sessionId])} scope={scope} projectId={projectId} onClose={() => setProviderDesktop(false)} /> : null}
      <Sheet visible={!!contextual} title={contextual === "handoff" ? copy("Bağlamlı agent devri", "Contextual handoff") : copy("İkinci görüş", "Second opinion")} onClose={() => setContextual(null)}>
        {contextual && session ? <HandoffSession key={JSON.stringify([scope.machineId, scope.sessionId, contextual])} scope={scope} source={session} mode={contextual} blocked={blocked} onClose={() => setContextual(null)} /> : null}
      </Sheet>
    </View>
  );
}
