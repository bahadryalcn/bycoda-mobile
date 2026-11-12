import { View } from "react-native";
import { HierarchyFrame } from "@/ui/hierarchy-frame";
import { decorativeSvgProps } from "@/ui/accessibility";
import Folder from "lucide-react-native/icons/folder";
import Pin from "lucide-react-native/icons/pin";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { fontSize, space } from "@/ui/tokens";
import type { SessionDirectoryRow } from "./session-directory";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";

/** Flat folder line inside a project's session list. */
export function SessionFolderRow({ row, projectName, onToggle }: {
  row: Extract<SessionDirectoryRow, { kind: "folder" }>;
  /** Named when the list mixes several projects' folders. */
  projectName?: string;
  onToggle: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  return <HierarchyFrame depth={row.depth} typeSize={fontSize.small} reservedWidth={space.sm + 16 + space.row * 2 + 40}>{({indent,compressed}) => <PressableCard label={[[...(row.ancestors ?? []), row.folder.name].join(" / "), projectName, row.folder.pinned ? copy("Sabit", "Pinned") : "", `${row.count}`].filter(Boolean).join(". ")} expanded={row.expanded}
    onPress={onToggle} style={{ minHeight: 40, paddingVertical: space.sm, paddingStart: space.sm + indent }}>
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
  </PressableCard>}</HierarchyFrame>;
}
