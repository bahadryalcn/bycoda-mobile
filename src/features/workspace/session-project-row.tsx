import { View } from "react-native";
import { Body, PressableCard, Row } from "@/ui/primitives";
import { ProjectIcon } from "@/ui/project-icon";
import { ActivityBadge } from "@/ui/activity-badge";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { ProjectSessionCollectionRow } from "./session-collection";

export function SessionProjectRow({ row, onToggle }: {
  row: Extract<ProjectSessionCollectionRow, { kind: "project" }>;
  onToggle: () => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  return (
    <PressableCard
      label={[row.project.name, row.project.cwd, `${row.count}`, row.running ? `${row.running} ${copy("Çalışıyor", "Running")}` : ""].filter(Boolean).join(". ")}
      expanded={row.expanded}
      onPress={onToggle}
      style={{ borderWidth: 0, backgroundColor: colors.background, paddingVertical: space.sm }}
    >
      <Row style={{ flexWrap: "nowrap" }}>
        <ProjectIcon appearance={row.project.appearance} />
        <View style={[uiStyles.grow, { gap: space.xs }]}>
          <Body style={uiStyles.label} numberOfLines={1}>{row.project.name}</Body>
          <Row style={{ gap: space.xs }}>
            <Body muted style={uiStyles.caption}>{row.count} · {copy("Oturumlar", "Sessions")}</Body>
            {row.running ? <ActivityBadge count={row.running} /> : null}
          </Row>
        </View>
        <DisclosureChevron expanded={row.expanded} color={colors.muted} />
      </Row>
    </PressableCard>
  );
}
