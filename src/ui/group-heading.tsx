import type { ReactNode } from "react";
import { View } from "react-native";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { SectionHeader } from "./layout";
import { space } from "./tokens";

/**
 * Heading of a group inside a picker list: the shared section header, led by an optional mark
 * (e.g. the provider of the models below it). Used by `SelectField` groups and the model picker.
 */
export function GroupHeading({ title, icon }: { title: string; icon?: ReactNode }) {
  const { uiStyles } = useMobileTheme();
  if (!icon) return <SectionHeader title={title} />;
  return (
    <View style={[uiStyles.sectionHeader, { gap: space.sm }]}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ flexShrink: 0 }}>
        {icon}
      </View>
      <Body selectable={false} accessibilityRole="header" style={[uiStyles.sectionLabel, uiStyles.grow]}>
        {title}
      </Body>
    </View>
  );
}

/** A second-level caption inside a group, e.g. the model whose effort variants follow. */
export function SubgroupHeading({ title }: { title: string }) {
  const { uiStyles } = useMobileTheme();
  return (
    <Body selectable={false} muted style={[uiStyles.caption, { paddingTop: space.sm, fontWeight: "500" }]}>
      {title}
    </Body>
  );
}
