import { useMobileTheme } from "@/ui/theme";
import { useState, type ReactNode } from "react";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import { router } from "expo-router";
import { Sheet } from "@/ui/primitives";
import { SessionOptionsMenu } from "./session-options-menu";
import { useCopy } from "@/ui/copy";
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
import { useHostQuery } from "@/state/queries";
import { openModelSheet } from "./composer-model-sheet";
import { activeSessionModel } from "./catalog";
import { useSessionActions } from "./session-actions";
import { sessionSummaryFromSnapshot } from "./session-row-action-model";
import type { HostSession } from "./wire";
import type { SessionToolbarProps as ToolbarBaseProps } from "./session-types";

export type SessionToolbarViewProps = ToolbarBaseProps & {
  /** Project name and checkout shown in the shared session details. */
  projectName?: string;
  /** Proves the session's project is still visible before any session action. */
  canRead: () => boolean;
  /** The open session was deleted; leave it for the sessions list. */
  onDeleted: () => void;
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
  projectName,
  canRead,
  onDeleted,
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
  const optionsMenu = (sessionActions: ReactNode) => (
    <SessionOptionsMenu
      visible={menu}
      hasSession={!!session}
      projectId={projectId}
      sessionId={scope.sessionId}
      blocked={blocked}
      running={session?.status === "running"}
      detailed={view === "details"}
      sessionActions={sessionActions}
      modelDetail={session ? activeSessionModel(session.session).name : undefined}
      onClose={() => setMenu(false)}
      actions={{
        find: onFind,
        toggleDetails: () => onViewChange(view === "details" ? "messages" : "details"),
        model: () => openModelSheet(scope.machineId, scope.sessionId),
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
      {session && projectId ? (
        <SessionRecordActions
          machineId={scope.machineId}
          projectId={projectId}
          projectName={projectName}
          session={session}
          canRead={canRead}
          onDeleted={onDeleted}
          menuOpen={menu}
          onCloseMenu={() => setMenu(false)}
        >
          {optionsMenu}
        </SessionRecordActions>
      ) : optionsMenu(null)}
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
            ? copy("Bağlamla devret", "Contextual handoff")
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

/**
 * The open session's record actions (rename, pin, settle, read state, snooze, move, copy, details,
 * archive, stop, delete) through the same owner as the list row menu, listed in the options menu.
 */
function SessionRecordActions({
  machineId,
  projectId,
  projectName,
  session,
  canRead,
  onDeleted,
  menuOpen,
  onCloseMenu,
  children,
}: {
  machineId: string;
  projectId: string;
  projectName?: string;
  session: HostSession;
  canRead: () => boolean;
  onDeleted: () => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  children: (sessionActions: ReactNode) => ReactNode;
}) {
  const lifecycle = useHostQuery<{ records: { sessionId: string; state: string }[] }>(
    ["sessions-lifecycle"],
    "sessions.lifecycle.list",
    {},
  );
  const settled = !!lifecycle.data?.records.some((record) => record.sessionId === session.session.id && record.state === "settled");
  const actions = useSessionActions({
    machineId,
    projectId,
    projectName,
    session: sessionSummaryFromSnapshot(session),
    canRead,
    settled,
    onDeleted,
  });
  // The options sheet closes before an action runs, so a confirmation never stacks on it; copy rows
  // keep it open for their "Copied" feedback.
  const menu = menuOpen
    ? actions.renderMenu((action) => ({ ...action, onPress: () => { onCloseMenu(); action.onPress(); } }))
    : null;
  return (
    <>
      {children(menu)}
      {actions.element}
    </>
  );
}
