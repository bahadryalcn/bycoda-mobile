import { useState, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";
import MessageCircleQuestion from "lucide-react-native/icons/message-circle-question";
import { SideChatSheet } from "@/features/side-chat/side-chat-sheet";
import Archive from "lucide-react-native/icons/archive";
import ArchiveRestore from "lucide-react-native/icons/archive-restore";
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left";
import Bot from "lucide-react-native/icons/bot";
import ClipboardCheck from "lucide-react-native/icons/clipboard-check";
import Cpu from "lucide-react-native/icons/cpu";
import Folder from "lucide-react-native/icons/folder";
import FolderKanban from "lucide-react-native/icons/folder-kanban";
import Globe from "lucide-react-native/icons/globe";
import Import from "lucide-react-native/icons/import";
import KeyRound from "lucide-react-native/icons/key-round";
import ListChecks from "lucide-react-native/icons/list-checks";
import Pin from "lucide-react-native/icons/pin";
import PinOff from "lucide-react-native/icons/pin-off";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import Settings2 from "lucide-react-native/icons/settings-2";
import Search from "lucide-react-native/icons/search";
import Server from "lucide-react-native/icons/server";
import Sparkles from "lucide-react-native/icons/sparkles";
import SquareTerminal from "lucide-react-native/icons/square-terminal";
import Trash2 from "lucide-react-native/icons/trash-2";
import {
  NavigationGroup,
  NavigationRow,
  RowIcon,
  SectionHeader,
  Sheet,
  Stack,
  ToggleField,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { SessionArtifacts } from "./session-artifacts";

export type SessionOptionsActions = {
  find: () => void;
  toggleDetails: () => void;
  settings: () => void;
  model: () => void;
  pin: () => void;
  archive: () => void;
  review: () => void;
  notes: () => void;
  handoff: () => void;
  secondOpinion: () => void;
  importHistory: () => void;
  project: () => void;
  organization: () => void;
  browser: () => void;
  worktreeRemoval: () => void;
  terminal: () => void;
  preferences: () => void;
  providers: () => void;
  ssh: () => void;
};

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

/**
 * Session options, ordered by frequency in one list of about ten rows. Agent and Project open their
 * own short lists, so rare tools stay one step away without a wall of rows. Refresh lives in the
 * header's offline status, its only useful moment.
 */
export function SessionOptionsMenu({
  visible,
  hasSession,
  projectId,
  sessionId,
  blocked,
  running,
  detailed,
  pinned,
  archived,
  modelDetail,
  actions,
  onClose,
}: {
  visible: boolean;
  hasSession: boolean;
  projectId?: string;
  sessionId: string;
  blocked: boolean;
  running: boolean;
  detailed: boolean;
  pinned?: boolean;
  archived?: boolean;
  /** The current model, shown on the Model and access row. */
  modelDetail?: string;
  actions: SessionOptionsActions;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [sideOpen, setSideOpen] = useState(false);
  const [section, setSection] = useState<"agent" | "project" | null>(null);
  const icon = (Glyph: IconComponent, tone?: "danger"): ReactNode => <RowIcon glyph={Glyph} tone={tone} />;
  const go = (action: () => void) => () => {
    onClose();
    action();
  };
  const fromSection = (action: () => void) => () => {
    setSection(null);
    action();
  };
  const open = (next: "agent" | "project") => () => {
    onClose();
    setSection(next);
  };
  const runningNote = running
    ? copy("Oturum çalışırken kullanılamaz.", "Unavailable while the session is running.")
    : undefined;
  const showNotes = !!projectId && hasSession;
  const updatable = hasSession && !!projectId;
  return (
    <>
      <SideChatSheet visible={sideOpen} sessionId={sessionId} onClose={() => setSideOpen(false)} />
      <Sheet visible={visible} title={copy("Oturum seçenekleri", "Session options")} onClose={onClose}>
        <NavigationGroup>
          <NavigationRow
            icon={icon(Search)}
            label={copy("Mesajlarda bul", "Find in messages")}
            disabled={!hasSession}
            onPress={go(actions.find)}
          />
          {hasSession ? (
            <NavigationRow
              icon={icon(SlidersHorizontal)}
              label={copy("Model ve erişim", "Model and access")}
              detail={modelDetail}
              disabled={blocked}
              onPress={go(actions.model)}
            />
          ) : null}
          {updatable ? (
            <>
              <NavigationRow
                intent="command"
                icon={icon(pinned ? PinOff : Pin)}
                label={pinned ? copy("Sabitlemeyi kaldır", "Unpin") : copy("Sabitle", "Pin")}
                disabled={blocked}
                onPress={go(actions.pin)}
              />
              <NavigationRow
                intent="command"
                icon={icon(archived ? ArchiveRestore : Archive)}
                label={archived ? copy("Arşivden çıkar", "Unarchive") : copy("Arşivle", "Archive")}
                disabled={blocked}
                onPress={go(actions.archive)}
              />
            </>
          ) : null}
          {showNotes ? (
            <NavigationRow
              icon={icon(NotebookPen)}
              label={copy("Oturum notları", "Session notes")}
              disabled={blocked}
              onPress={go(actions.notes)}
            />
          ) : null}
          <ToggleField
            icon={icon(ListChecks)}
            label={copy("Ayrıntılı görünüm", "Detailed view")}
            help={copy(
              "Tam işlem geçmişi, düşünceler ve araç çıktıları.",
              "Full action history, reasoning and tool outputs.",
            )}
            value={detailed}
            onChange={() => actions.toggleDetails()}
          />
          <NavigationRow
            icon={icon(ClipboardCheck)}
            label={copy("Oturum incelemesi", "Session review")}
            disabled={blocked}
            onPress={go(actions.review)}
          />
          <NavigationRow
            icon={icon(Settings2)}
            label={copy("Oturum ayarları", "Session settings")}
            onPress={go(actions.settings)}
          />
          {hasSession ? (
            <NavigationRow icon={icon(Bot)} label={copy("Ajan", "Agent")} onPress={open("agent")} />
          ) : null}
          {projectId ? (
            <NavigationRow icon={icon(Folder)} label={copy("Proje", "Project")} onPress={open("project")} />
          ) : null}
        </NavigationGroup>
      </Sheet>
      <Sheet visible={section === "agent"} title={copy("Ajan", "Agent")} size="compact" onClose={() => setSection(null)}>
        <NavigationGroup>
          <NavigationRow
            icon={icon(MessageCircleQuestion)}
            label={copy("Yan soru", "Side question")}
            disabled={blocked}
            onPress={fromSection(() => setSideOpen(true))}
          />
          <NavigationRow
            icon={icon(ArrowRightLeft)}
            label={copy("Bağlamla devret", "Contextual handoff")}
            detail={runningNote}
            disabled={blocked || running}
            onPress={fromSection(actions.handoff)}
          />
          <NavigationRow
            icon={icon(Sparkles)}
            label={copy("İkinci görüş", "Second opinion")}
            detail={runningNote}
            disabled={blocked || running}
            onPress={fromSection(actions.secondOpinion)}
          />
          {projectId ? (
            <NavigationRow
              icon={icon(Import)}
              label={copy("Konuşma geçmişini içe aktar", "Import conversation history")}
              disabled={blocked}
              onPress={fromSection(actions.importHistory)}
            />
          ) : null}
        </NavigationGroup>
      </Sheet>
      {projectId ? (
        <Sheet visible={section === "project"} title={copy("Proje", "Project")} onClose={() => setSection(null)}>
          <Stack style={{ gap: space.lg }}>
            <NavigationGroup>
              <NavigationRow icon={icon(Folder)} label={copy("Projeyi aç", "Open project")} onPress={fromSection(actions.project)} />
              {hasSession ? (
                <>
                  <NavigationRow
                    icon={icon(FolderKanban)}
                    label={copy("Proje organizasyonu", "Project organization")}
                    disabled={blocked}
                    onPress={fromSection(actions.organization)}
                  />
                  <NavigationRow
                    icon={icon(Globe)}
                    label={copy("Tarayıcı", "Browser")}
                    disabled={blocked}
                    onPress={fromSection(actions.browser)}
                  />
                </>
              ) : null}
              <SessionArtifacts projectId={projectId} sessionId={sessionId} />
            </NavigationGroup>
            {hasSession ? (
              <View>
                <SectionHeader title={copy("Bilgisayar", "Computer")} />
                <NavigationGroup>
                  <NavigationRow
                    icon={icon(SquareTerminal)}
                    label={copy("Etkileşimli terminal", "Interactive terminal")}
                    disabled={blocked}
                    onPress={fromSection(actions.terminal)}
                  />
                  <NavigationRow
                    icon={icon(Cpu)}
                    label={copy("Bilgisayar tercihleri", "Computer preferences")}
                    disabled={blocked}
                    onPress={fromSection(actions.preferences)}
                  />
                  <NavigationRow
                    icon={icon(KeyRound)}
                    label={copy("Hesaplar ve MCP", "Accounts and MCP")}
                    disabled={blocked}
                    onPress={fromSection(actions.providers)}
                  />
                  <NavigationRow
                    icon={icon(Server)}
                    label={copy("Bilgisayarda SSH", "SSH on the computer")}
                    disabled={blocked}
                    onPress={fromSection(actions.ssh)}
                  />
                </NavigationGroup>
              </View>
            ) : null}
            {hasSession ? (
              <NavigationGroup>
                <NavigationRow
                  icon={icon(Trash2, "danger")}
                  label={copy("Çalışma ağacı kaldırma", "Worktree removal")}
                  tone="danger"
                  disabled={blocked}
                  onPress={fromSection(actions.worktreeRemoval)}
                />
              </NavigationGroup>
            ) : null}
          </Stack>
        </Sheet>
      ) : null}
    </>
  );
}
