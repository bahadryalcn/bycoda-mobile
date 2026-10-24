import Folder from "lucide-react-native/icons/folder";
import Pin from "lucide-react-native/icons/pin";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { SessionDirectoryRow } from "./session-directory";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";

export function SessionFolderRow({ row, onToggle }: {
  row: Extract<SessionDirectoryRow, { kind: "folder" }>;
  onToggle: () => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  return <PressableCard label={[row.folder.name, row.folder.pinned ? copy("Sabit", "Pinned") : "", `${row.count}`].filter(Boolean).join(". ")} expanded={row.expanded}
    onPress={onToggle} style={{ borderWidth: 0, backgroundColor: colors.background,
      paddingVertical: space.sm, paddingStart: space.lg + row.depth * space.md }}>
    <Row style={{ flexWrap: "nowrap" }}>
      <Folder size={18} color={colors.muted} />
      <Body style={[uiStyles.grow, uiStyles.sectionLabel, { paddingHorizontal: 0 }]}>{row.folder.name}</Body>
      {row.folder.pinned ? <Pin accessible={false} size={14} color={colors.muted} /> : null}
      <Body muted style={uiStyles.caption}>{row.count}</Body>
      <DisclosureChevron expanded={row.expanded} color={colors.muted} />
    </Row>
  </PressableCard>;
}
