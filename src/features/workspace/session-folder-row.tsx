import { useState } from "react";
import { View } from "react-native";
import { HierarchyFrame } from "@/ui/hierarchy-frame";
import { decorativeSvgProps } from "@/ui/accessibility";
import Folder from "lucide-react-native/icons/folder";
import FolderInput from "lucide-react-native/icons/folder-input";
import ListChecks from "lucide-react-native/icons/list-checks";
import Pencil from "lucide-react-native/icons/pencil";
import Pin from "lucide-react-native/icons/pin";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { RowOptionsSheet, type MenuAction } from "@/ui/overflow-menu";
import { fontSize, metrics, space } from "@/ui/tokens";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import type { SessionDirectoryRow } from "./session-directory";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { ProjectOrganization } from "./project-organization";

type FolderRow = Extract<SessionDirectoryRow, { kind: "folder" }>;
type FolderEditor = "folderName" | "folderMove" | "folderSessions";

/**
 * Flat folder line inside a session list. Tap collapses or expands; long-press opens the shared
 * row options sheet with the folder edits the computer's organization editor supports.
 */
export function SessionFolderRow({ row, projectName, projectId, onToggle }: {
  row: FolderRow;
  /** Named when the list mixes several projects' folders. */
  projectName?: string;
  /** Enables folder options (rename, move, choose conversations) through the computer. */
  projectId?: string;
  onToggle: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editing, setEditing] = useState<{ kind: FolderEditor; token: string }>();
  // The organization editor needs one of the folder's conversations as its context.
  const contextSession = row.folder.sessionIds[0];
  const supported = !!projectId && !!machine && !!contextSession &&
    machine.capabilities?.includes("projects.organization.desktop.v1") === true;
  const edit = (kind: FolderEditor) => () => {
    if (connection.isCurrent()) setEditing({ kind, token: connection.token });
  };
  const actions: MenuAction[] = supported ? [
    { key: "rename", label: copy("Yeniden adlandır", "Rename"), icon: <Pencil />, opens: true, onPress: edit("folderName") },
    { key: "move", label: copy("Klasörü taşı", "Move folder"), icon: <FolderInput />, opens: true, onPress: edit("folderMove") },
    { key: "sessions", label: copy("Oturumları seç", "Choose sessions"), icon: <ListChecks />, opens: true, onPress: edit("folderSessions") },
  ] : [];
  const name = [...(row.ancestors ?? []), row.folder.name].join(" / ");
  return <>
    <HierarchyFrame depth={row.depth} typeSize={fontSize.small} reservedWidth={space.sm + 16 + space.row * 2 + 40}>{({indent,compressed}) => <PressableCard label={[name, projectName, row.folder.pinned ? copy("Sabitlendi", "Pinned") : "", `${row.count}`].filter(Boolean).join(". ")} expanded={row.expanded}
      onPress={onToggle}
      onLongPress={actions.length ? () => { if (connection.isCurrent()) setOptionsOpen(true); } : undefined}
      optionsLabel={actions.length ? copy("Klasör seçenekleri", "Folder options") : undefined}
      style={{ minHeight: metrics.touchTarget, paddingVertical: space.sm, paddingStart: space.sm + indent }}>
      <Row style={{ flexWrap: "nowrap", gap: space.row }}>
        <Folder {...decorativeSvgProps} size={16} color={colors.muted} />
        <View style={[uiStyles.grow, { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
          <Body numberOfLines={1} style={[uiStyles.label, { flexShrink: 1 }]}>
            {compressed && row.ancestors?.length ? `${row.ancestors.at(-1)} / ` : ""}{row.folder.name}
          </Body>
          <Body muted style={uiStyles.caption}>{row.count}</Body>
          {projectName ? <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 2 }]}>{projectName}</Body> : null}
          {row.folder.pinned ? <Pin {...decorativeSvgProps} size={12} color={colors.muted} /> : null}
        </View>
        <DisclosureChevron expanded={row.expanded} color={colors.muted} />
      </Row>
    </PressableCard>}</HierarchyFrame>
    <RowOptionsSheet
      visible={optionsOpen}
      title={copy("Klasör seçenekleri", "Folder options")}
      subtitle={name}
      actions={actions}
      onClose={() => setOptionsOpen(false)}
    />
    {editing && supported && editing.token === connection.token && projectId && machine ? (
      <ProjectOrganization
        key={editing.kind}
        scope={{ machineId: machine.id, sessionId: contextSession! }}
        projectId={projectId}
        initialEditor={{ kind: editing.kind, folderId: row.folder.id }}
        onClose={() => setEditing(undefined)}
      />
    ) : null}
  </>;
}
