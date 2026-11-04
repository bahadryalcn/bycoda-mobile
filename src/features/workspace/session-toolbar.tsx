import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { SessionHeader } from "./session-header";
import { sessionIntent } from "@/domain/session-authority";
import { useState } from "react";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Square from "lucide-react-native/icons/square";
import { router } from "expo-router";
import {
  Disclosure,
  NavigationGroup,
  NavigationRow,
  Sheet,
} from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
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
import { questionNeedsAttention, questionStatusLabel } from "./question-status";

export function SessionToolbar({
  scope,
  projectId,
  contextLabel,
  query,
  blocked,
  onSettings,
  onRefresh,
  onCommand,
}: SessionToolbarProps) {
  useMobileTheme();
  const copy = useCopy();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
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
  const [mobilePty, setMobilePty] = useState(false);
  const [providerDesktop, setProviderDesktop] = useState(false);
  const [contextual, setContextual] = useState<
    "handoff" | "secondOpinion" | null
  >(null);
  const [contextualCompact, setContextualCompact] = useState(false);
  const [stopping, setStopping] = useState(false);
  // The open view reports compact sizing; every open starts from the default so a previous
  // report can never size the next sheet.
  const openContextual = (mode: "handoff" | "secondOpinion") => {
    setContextualCompact(false);
    setContextual(mode);
  };
  const closeContextual = () => setContextual(null);
  const queue = useSessionQueue(scope);
  const status = !session
    ? query.error
      ? copy("Durum yüklenemedi", "Status unavailable")
      : copy("Yükleniyor", "Loading")
    : session.session.pendingQuestion
      ? questionStatusLabel(session.session.pendingQuestion, copy)
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
        ...(session?.session.worktreeCwd
          ? { cwd: session.session.worktreeCwd }
          : {}),
      },
    });
  };

  const dotColor =
    !session && query.error
      ? colors.danger
      : (session?.session.pendingQuestion &&
            questionNeedsAttention(session.session.pendingQuestion)) ||
          session?.status === "interrupted"
        ? colors.warning
        : session?.status === "running"
          ? colors.live
          : colors.muted;
  return (
    <View style={{ paddingBottom: space.xs }}>
      <SessionHeader
        status={status}
        statusColor={dotColor}
        compact={keyboardVisible}
        context={
          contextLabel ??
          (session
            ? [
                session.session.harness,
                session.session.model.replace(/^[^:]+:/, ""),
              ].join(" · ")
            : undefined)
        }
      >
        {session?.status === "running" && session.runId ? (
          <ChatToolbarAction
            label={copy("Durdur", "Stop")}
            tone="danger"
            busy={stopping}
            disabled={blocked}
            onPress={() => {
              const intent = sessionIntent(session, {
                type: "cancel",
                sessionId: scope.sessionId,
                runId: session.runId,
              });
              // Pause durable follow-ups before stopping the exact active run.
              // A pause failure must not hide the session's primary Stop action.
              void (async () => {
                setStopping(true);
                try {
                  if (queue.supported) await queue.pause().catch(() => {});
                  await onCommand(intent);
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
      </SessionHeader>
      <Sheet
        size="compact"
        visible={menu}
        title={copy("Oturum seçenekleri", "Session options")}
        onClose={() => setMenu(false)}
      >
        <NavigationGroup>
          <NavigationRow
            label={copy("Oturum ayarları", "Session settings")}
            detail={
              session
                ? [
                    session.session.harness,
                    session.session.model.replace(/^[^:]+:/, ""),
                  ].join(" · ")
                : undefined
            }
            onPress={() => {
              setMenu(false);
              onSettings();
            }}
          />
          <NavigationRow
            label={copy("Oturum incelemesi", "Session review")}
            disabled={blocked}
            onPress={() => {
              setMenu(false);
              setReview(true);
            }}
          />
          {projectId && session ? (
            <NavigationRow
              label={copy("Oturum notları", "Session notes")}
              disabled={blocked}
              onPress={() => {
                setMenu(false);
                setNotes(true);
              }}
            />
          ) : null}
          <NavigationRow
            label={copy("Yenile", "Refresh")}
            intent="command"
            disabled={query.isFetching}
            onPress={() => {
              setMenu(false);
              onRefresh();
            }}
          />
        </NavigationGroup>
        {session ? (
          <Disclosure label={copy("Agent", "Agent")}>
            <NavigationGroup>
              <NavigationRow
                label={copy("Bağlamlı agent devri", "Contextual handoff")}
                disabled={blocked || session.status === "running"}
                onPress={() => {
                  setMenu(false);
                  openContextual("handoff");
                }}
              />
              <NavigationRow
                label={copy("İkinci görüş", "Second opinion")}
                disabled={blocked || session.status === "running"}
                onPress={() => {
                  setMenu(false);
                  openContextual("secondOpinion");
                }}
              />
              {projectId ? (
                <NavigationRow
                  label={copy(
                    "Konuşma geçmişini içe aktar",
                    "Import conversation history",
                  )}
                  disabled={blocked}
                  onPress={() => {
                    setMenu(false);
                    setHistoryImport(true);
                  }}
                />
              ) : null}
            </NavigationGroup>
          </Disclosure>
        ) : null}
        {projectId ? (
          <Disclosure label={copy("Proje", "Project")}>
            <NavigationGroup>
              <NavigationRow
                label={copy("Proje", "Project")}
                onPress={() => {
                  setMenu(false);
                  openProject();
                }}
              />
              {session ? (
                <>
                  <NavigationRow
                    label={copy("Proje organizasyonu", "Project organization")}
                    disabled={blocked}
                    onPress={() => {
                      setMenu(false);
                      setOrganization(true);
                    }}
                  />
                  <NavigationRow
                    label={copy("Tarayıcı", "Browser")}
                    disabled={blocked}
                    onPress={() => {
                      setMenu(false);
                      setBrowser(true);
                    }}
                  />
                  <NavigationRow
                    label={copy("Çalışma klasörü kaldırma", "Worktree removal")}
                    disabled={blocked}
                    onPress={() => {
                      setMenu(false);
                      setWorktreeRemoval(true);
                    }}
                  />
                </>
              ) : null}
            </NavigationGroup>
            <SessionArtifacts
              projectId={projectId}
              sessionId={scope.sessionId}
            />
          </Disclosure>
        ) : null}
        {projectId && session ? (
          <Disclosure label={copy("Bilgisayar", "Computer")}>
            <NavigationGroup>
              <NavigationRow
                label={copy("Etkileşimli terminal", "Interactive terminal")}
                disabled={blocked}
                onPress={() => {
                  setMenu(false);
                  setMobilePty(true);
                }}
              />
              <NavigationRow
                label={copy("Bilgisayar tercihleri", "Computer preferences")}
                disabled={blocked}
                onPress={() => {
                  setMenu(false);
                  setDesktopPreferences(true);
                }}
              />
              <NavigationRow
                label={copy("Hesaplar ve MCP", "Accounts and MCP")}
                disabled={blocked}
                onPress={() => {
                  setMenu(false);
                  setProviderDesktop(true);
                }}
              />
              <NavigationRow
                label={copy("Bilgisayarda SSH", "SSH on the computer")}
                disabled={blocked}
                onPress={() => {
                  setMenu(false);
                  setSshWorkspace(true);
                }}
              />
            </NavigationGroup>
          </Disclosure>
        ) : null}
      </Sheet>
      {review && session ? (
        <SessionCheckpoints
          scope={scope}
          session={session}
          blocked={blocked}
          onCommand={onCommand}
          onRefresh={onRefresh}
          onClose={() => setReview(false)}
        />
      ) : null}
      {notes && projectId ? (
        <SessionNotes
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setNotes(false)}
        />
      ) : null}
      {browser && projectId ? (
        <SessionBrowser
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setBrowser(false)}
        />
      ) : null}
      {worktreeRemoval && projectId ? (
        <WorktreeRemoval
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setWorktreeRemoval(false)}
        />
      ) : null}
      {sshWorkspace && projectId ? (
        <SshWorkspace
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setSshWorkspace(false)}
        />
      ) : null}
      {historyImport && projectId ? (
        <HistoryImport
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          contextLabel={contextLabel}
          onClose={() => setHistoryImport(false)}
        />
      ) : null}
      {mobilePty && projectId ? (
        <MobilePty
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setMobilePty(false)}
        />
      ) : null}
      {desktopPreferences && projectId ? (
        <DesktopPreferences
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setDesktopPreferences(false)}
        />
      ) : null}
      {organization && projectId ? (
        <ProjectOrganization
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setOrganization(false)}
        />
      ) : null}
      {providerDesktop && projectId ? (
        <ProviderDesktop
          key={JSON.stringify([scope.machineId, projectId, scope.sessionId])}
          scope={scope}
          projectId={projectId}
          onClose={() => setProviderDesktop(false)}
        />
      ) : null}
      <Sheet
        visible={!!contextual}
        size={contextualCompact ? "compact" : "form"}
        title={
          contextual === "handoff"
            ? copy("Bağlamlı agent devri", "Contextual handoff")
            : copy("İkinci görüş", "Second opinion")
        }
        onClose={closeContextual}
      >
        {contextual && session ? (
          <HandoffSession
            key={JSON.stringify([scope.machineId, scope.sessionId, contextual])}
            scope={scope}
            source={session}
            mode={contextual}
            blocked={blocked}
            onClose={closeContextual}
            onCompactChange={setContextualCompact}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
