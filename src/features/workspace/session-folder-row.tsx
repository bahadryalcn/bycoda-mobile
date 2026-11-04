import { View } from "react-native";
import { HierarchyFrame } from "@/ui/hierarchy-frame";
import { decorativeSvgProps } from "@/ui/accessibility";
import Folder from "lucide-react-native/icons/folder";
import Pin from "lucide-react-native/icons/pin";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { colors, fontSize, space } from "@/ui/tokens";
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
  return <HierarchyFrame depth={row.depth} typeSize={fontSize.small} reservedWidth={space.lg + space.sm + 18 + 17 + space.row * 2}>{({indent,compressed}) => <PressableCard label={[[...(row.ancestors ?? []), row.folder.name].join(" / "), row.folder.pinned ? copy("Sabit", "Pinned") : "", `${row.count}`].filter(Boolean).join(". ")} expanded={row.expanded}
    onPress={onToggle} style={{ borderWidth: 0, backgroundColor: colors.background,
      paddingVertical: space.sm, paddingStart: space.lg + indent }}>
    <Row style={{ flexWrap: "nowrap" }}>
      <Folder size={18} color={colors.muted} />
      <View style={[uiStyles.grow, { gap: space.xxs }]}>
        <Body style={[uiStyles.sectionLabel, { paddingHorizontal: 0 }]}>{row.folder.name}</Body>
        {compressed && row.ancestors?.length ? <Body muted style={uiStyles.caption}>{row.ancestors.at(-1)}</Body> : null}
        <Row style={{ gap: space.xs }}>
          <Body muted style={uiStyles.caption}>{row.count}</Body>
          {row.folder.pinned ? <Pin {...decorativeSvgProps} size={14} color={colors.muted} /> : null}
        </Row>
      </View>
      <DisclosureChevron expanded={row.expanded} color={colors.muted} />
    </Row>
  </PressableCard>}</HierarchyFrame>;
}
