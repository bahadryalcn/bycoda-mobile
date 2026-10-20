import Folder from "lucide-react-native/icons/folder";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { SessionDirectoryRow } from "./session-directory";

export function SessionFolderRow({ row, onToggle }: {
  row: Extract<SessionDirectoryRow, { kind: "folder" }>;
  onToggle: () => void;
}) {
  return <PressableCard label={`${row.folder.name}. ${row.count}`} expanded={row.expanded}
    onPress={onToggle} style={{ borderWidth: 0, paddingStart: space.lg + row.depth * space.md }}>
    <Row style={{ flexWrap: "nowrap" }}>
      <Folder size={18} color={colors.muted} />
      <Body style={uiStyles.grow}>{row.folder.name}</Body>
      <Body muted>{row.count}</Body>
      <DisclosureChevron expanded={row.expanded} color={colors.muted} />
    </Row>
  </PressableCard>;
}
