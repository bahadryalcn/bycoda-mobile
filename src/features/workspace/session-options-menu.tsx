import { useState, type ComponentType, type ReactNode } from "react";
import MessageCircleQuestion from "lucide-react-native/icons/message-circle-question";
import { SideChatSheet } from "@/features/side-chat/side-chat-sheet";
import { StyleSheet, View } from "react-native";
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left";
import ClipboardCheck from "lucide-react-native/icons/clipboard-check";
import Cpu from "lucide-react-native/icons/cpu";
import Folder from "lucide-react-native/icons/folder";
import FolderKanban from "lucide-react-native/icons/folder-kanban";
import Globe from "lucide-react-native/icons/globe";
import Import from "lucide-react-native/icons/import";
import KeyRound from "lucide-react-native/icons/key-round";
import ListChecks from "lucide-react-native/icons/list-checks";
import { NotebookPen, Settings2 } from "@/ui/duotone-icon";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Search from "lucide-react-native/icons/search";
import Server from "lucide-react-native/icons/server";
import Sparkles from "lucide-react-native/icons/sparkles";
import SquareTerminal from "lucide-react-native/icons/square-terminal";
import Trash2 from "lucide-react-native/icons/trash-2";
import {
  Body,
  Disclosure,
  NavigationGroup,
  NavigationRow,
  PressableCard,
  SectionHeader,
  Separator,
  Sheet,
  Stack,
  ToggleField,
} from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { SessionArtifacts } from "./session-artifacts";

export type SessionOptionsActions = {
  find: () => void;
  toggleDetails: () => void;
  settings: () => void;
  review: () => void;
  notes: () => void;
  refresh: () => void;
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

/** Session options: the most used actions as tiles, then grouped rows; every row opens its own sheet or screen. */
export function SessionOptionsMenu({
  visible,
  hasSession,
  projectId,
  sessionId,
  blocked,
  running,
  refreshing,
  detailed,
  settingsDetail,
  actions,
  onClose,
}: {
  visible: boolean;
  hasSession: boolean;
  projectId?: string;
  sessionId: string;
  blocked: boolean;
  running: boolean;
  refreshing: boolean;
  detailed: boolean;
  settingsDetail?: string;
  actions: SessionOptionsActions;
  onClose: () => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const [sideOpen, setSideOpen] = useState(false);
  const icon =(Glyph: IconComponent): ReactNode => (
    <IconTile><Glyph size={18} strokeWidth={2} color={colors.muted} /></IconTile>
  );
  const go = (action: () => void) => () => {
    onClose();
    action();
  };
  const runningNote = running
    ? copy("Oturum çalışırken kullanılamaz.", "Unavailable while the session is running.")
    : undefined;
  const showNotes = !!projectId && hasSession;
  return (
    <>
    <SideChatSheet visible={sideOpen} sessionId={sessionId} onClose={() => setSideOpen(false)} />
    <Sheet visible={visible} title={copy("Oturum seçenekleri", "Session options")} onClose={onClose}>
      <Stack style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <ActionTile
            icon={<Search size={20} strokeWidth={2} color={colors.muted} />}
            label={copy("Mesajlarda bul", "Find in messages")}
            disabled={!hasSession}
            onPress={go(actions.find)}
          />
          <ActionTile
            icon={<Settings2 size={20} strokeWidth={2} color={colors.muted} />}
            label={copy("Oturum ayarları", "Session settings")}
            detail={settingsDetail}
            onPress={go(actions.settings)}
          />
          {showNotes ? (
            <ActionTile
              icon={<NotebookPen size={20} strokeWidth={2} color={colors.muted} />}
              label={copy("Oturum notları", "Session notes")}
              disabled={blocked}
              onPress={go(actions.notes)}
            />
          ) : null}
          <ActionTile
            icon={<RefreshCw size={20} strokeWidth={2} color={colors.muted} />}
            label={copy("Yenile", "Refresh")}
            detail={refreshing ? copy("Yenileniyor…", "Refreshing…") : undefined}
            disabled={refreshing}
            onPress={go(actions.refresh)}
          />
        </View>

        <View>
          <SectionHeader flush title={copy("Konuşma", "Conversation")} />
          <NavigationGroup>
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
          </NavigationGroup>
        </View>

        {hasSession ? (
          <View>
            <SectionHeader flush title={copy("Agent", "Agent")} />
            <NavigationGroup>
              <NavigationRow
                icon={icon(ArrowRightLeft)}
                label={copy("Bağlamlı agent devri", "Contextual handoff")}
                detail={runningNote}
                disabled={blocked || running}
                onPress={go(actions.handoff)}
              />
              <NavigationRow
                icon={icon(Sparkles)}
                label={copy("İkinci görüş", "Second opinion")}
                detail={runningNote}
                disabled={blocked || running}
                onPress={go(actions.secondOpinion)}
              />
              <NavigationRow
                icon={icon(MessageCircleQuestion)}
                label={copy("Yan soru", "Side question")}
                disabled={blocked}
                onPress={() => {
                  onClose();
                  setSideOpen(true);
                }}
              />
              {projectId ? (
                <NavigationRow
                  icon={icon(Import)}
                  label={copy("Konuşma geçmişini içe aktar", "Import conversation history")}
                  disabled={blocked}
                  onPress={go(actions.importHistory)}
                />
              ) : null}
            </NavigationGroup>
          </View>
        ) : null}

        {projectId ? (
          <View>
            <SectionHeader flush title={copy("Proje", "Project")} />
            <NavigationGroup>
              <NavigationRow icon={icon(Folder)} label={copy("Projeyi aç", "Open project")} onPress={go(actions.project)} />
              {hasSession ? (
                <>
                  <NavigationRow
                    icon={icon(FolderKanban)}
                    label={copy("Proje organizasyonu", "Project organization")}
                    disabled={blocked}
                    onPress={go(actions.organization)}
                  />
                  <NavigationRow
                    icon={icon(Globe)}
                    label={copy("Tarayıcı", "Browser")}
                    disabled={blocked}
                    onPress={go(actions.browser)}
                  />
                </>
              ) : null}
              <SessionArtifacts projectId={projectId} sessionId={sessionId} />
            </NavigationGroup>
            {hasSession ? (
              <>
                <Separator />
                <NavigationGroup>
                  <NavigationRow
                    icon={icon(Trash2)}
                    label={copy("Çalışma ağacı kaldırma", "Worktree removal")}
                    tone="danger"
                    disabled={blocked}
                    onPress={go(actions.worktreeRemoval)}
                  />
                </NavigationGroup>
              </>
            ) : null}
          </View>
        ) : null}

        {projectId && hasSession ? (
          <Disclosure label={copy("Bilgisayar", "Computer")}>
            <NavigationGroup>
              <NavigationRow
                icon={icon(SquareTerminal)}
                label={copy("Etkileşimli terminal", "Interactive terminal")}
                disabled={blocked}
                onPress={go(actions.terminal)}
              />
              <NavigationRow
                icon={icon(Cpu)}
                label={copy("Bilgisayar tercihleri", "Computer preferences")}
                disabled={blocked}
                onPress={go(actions.preferences)}
              />
              <NavigationRow
                icon={icon(KeyRound)}
                label={copy("Hesaplar ve MCP", "Accounts and MCP")}
                disabled={blocked}
                onPress={go(actions.providers)}
              />
              <NavigationRow
                icon={icon(Server)}
                label={copy("Bilgisayarda SSH", "SSH on the computer")}
                disabled={blocked}
                onPress={go(actions.ssh)}
              />
            </NavigationGroup>
          </Disclosure>
        ) : null}
      </Stack>
    </Sheet>
    </>
  );
}

/** A large quick-action tile: two per row, at least 56dp tall, icon above the label. */
function ActionTile({ icon, label, detail, disabled, onPress }: {
  icon: ReactNode;
  label: string;
  detail?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <PressableCard
      label={[label, detail].filter(Boolean).join(". ")}
      disabled={disabled}
      onPress={onPress}
      style={{
        // Filled tiles align to the gutter; the shared press style would bleed them outward.
        marginHorizontal: 0,
        flexBasis: "46%",
        flexGrow: 1,
        minHeight: metrics.rowHeightSession,
        padding: space.md,
        gap: space.sm,
        borderRadius: radii.card,
        borderCurve: "continuous",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.panel,
      }}
    >
      <IconTile>{icon}</IconTile>
      <View style={[uiStyles.grow, { gap: space.xxs }]}>
        <Body style={uiStyles.label}>{label}</Body>
        {detail ? <Body muted numberOfLines={1} style={uiStyles.caption}>{detail}</Body> : null}
      </View>
    </PressableCard>
  );
}
