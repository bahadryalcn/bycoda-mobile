import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import { router } from "expo-router";
import { Sheet } from "@/ui/primitives";
import { SessionOptionsMenu } from "./session-options-menu";
import { useCopy } from "@/ui/copy";
import type { SessionToolbarProps } from "./session-types";
import type { TranscriptView } from "./transcript-model";
import { ChatAction } from "@/ui/chat-controls";
import { SessionFiles } from "./session-files";
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
import { useHostMutation } from "@/state/queries";
import { captureSessionAuthority } from "@/domain/session-authority";
import { showToast } from "@/ui/toast";
import { errorMessage } from "@/ui/error-message";
import { openModelSheet } from "./composer-model-sheet";
import type { HostSession } from "./wire";
import { activeSessionModel } from "./catalog";

export type SessionToolbarViewProps = SessionToolbarProps & {
  onFind: () => void;
  view: TranscriptView;
  onViewChange: (view: TranscriptView) => void;
};

/** Header actions (files, one overflow menu) and the sheets they open; Stop lives in the composer. */
export function SessionToolbar({
  scope,
  projectId,
  contextLabel,
  query,
  blocked,
  onSettings,
  onRefresh,
  onCommand,
  onFind,
  view,
  onViewChange,
}: SessionToolbarViewProps) {
  const { colors } = useMobileTheme();
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
  const [mobilePty, setMobilePty] = useState(false);
  const [providerDesktop, setProviderDesktop] = useState(false);
  const [contextual, setContextual] = useState<"handoff" | "secondOpinion" | null>(null);
  const [contextualCompact, setContextualCompact] = useState(false);
  // The open view reports compact sizing; every open starts from the default so a previous
  // report can never size the next sheet.
  const openContextual = (mode: "handoff" | "secondOpinion") => {
    setContextualCompact(false);
    setContextual(mode);
  };
  const closeContextual = () => setContextual(null);
  const update = useHostMutation<HostSession>("sessions.update", ["sessions", projectId]);
  // Pin and archive confirm with a toast; archive offers Undo instead of asking first.
  const setFlag = (patch: { pinned: boolean } | { archived: boolean }, done: string, undo?: () => void) => {
    if (!session || !projectId || update.isPending) return;
    void update
      .mutateAsync({ projectId, sessionId: scope.sessionId, ...captureSessionAuthority(session), ...patch })
      .then(() => {
        onRefresh();
        showToast({ message: done, ...(undo ? { action: { label: copy("Geri al", "Undo"), onPress: undo } } : {}) });
      })
      .catch((cause: unknown) => showToast({ tone: "danger", message: errorMessage(cause, copy) }));
  };
  const toggleArchive = (archived: boolean) =>
    setFlag(
      { archived },
      archived ? copy("Oturum arşivlendi", "Session archived") : copy("Oturum arşivden çıkarıldı", "Session unarchived"),
      archived ? () => toggleArchive(false) : undefined,
    );
  const openProject = () => {
    if (!projectId) return;
    router.navigate({
      pathname: "/project/[id]",
      params: {
        id: projectId,
        machineId: scope.machineId,
        ...(session?.session.worktreeCwd ? { cwd: session.session.worktreeCwd } : {}),
      },
    });
  };

  return (
    <>
      {session ? <SessionFiles scope={scope} session={session} /> : null}
      <ChatAction
        label={copy("Oturum seçenekleri", "Session options")}
        onPress={() => setMenu(true)}
      >
        <Ellipsis size={20} color={colors.muted} />
      </ChatAction>
      <SessionOptionsMenu
        visible={menu}
        hasSession={!!session}
        projectId={projectId}
        sessionId={scope.sessionId}
        blocked={blocked}
        running={session?.status === "running"}
        detailed={view === "details"}
        pinned={session?.pinned}
        archived={session?.archived}
        modelDetail={session ? activeSessionModel(session.session).name : undefined}
        onClose={() => setMenu(false)}
        actions={{
          find: onFind,
          toggleDetails: () => onViewChange(view === "details" ? "messages" : "details"),
          settings: onSettings,
          model: () => openModelSheet(scope.machineId, scope.sessionId),
          pin: () =>
            setFlag(
              { pinned: !session?.pinned },
              session?.pinned ? copy("Sabitleme kaldırıldı", "Unpinned") : copy("Oturum sabitlendi", "Session pinned"),
            ),
          archive: () => toggleArchive(!session?.archived),
          review: () => setReview(true),
          notes: () => setNotes(true),
          handoff: () => openContextual("handoff"),
          secondOpinion: () => openContextual("secondOpinion"),
          importHistory: () => setHistoryImport(true),
          project: openProject,
          organization: () => setOrganization(true),
          browser: () => setBrowser(true),
          worktreeRemoval: () => setWorktreeRemoval(true),
          terminal: () => setMobilePty(true),
          preferences: () => setDesktopPreferences(true),
          providers: () => setProviderDesktop(true),
          ssh: () => setSshWorkspace(true),
        }}
      />
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
    </>
  );
}
