import { useMobileTheme } from "./theme";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { Collapsible } from "panelui-native/components/collapsible";
import { View } from "react-native";
import { Body } from "./typography";
import { metrics, space, type SemanticTone } from "./tokens";
import { disclosureAccessibleLabel } from "./disclosure-label";
import { DisclosureChevron } from "./disclosure-motion";
import { useInNavigationGroup } from "./navigation-group-context";

export function Disclosure({
  label,
  children,
  detail,
  feedback,
  defaultExpanded = false,
  tone,
}: PropsWithChildren<{ label: string; detail?: string; feedback?: ReactNode; defaultExpanded?: boolean; tone?: SemanticTone }>) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visited, setVisited] = useState(defaultExpanded);
  // In a NavigationGroup the trigger takes the rows' inset so its label aligns with theirs.
  const grouped = useInNavigationGroup();
  return (
    <Collapsible variant="ghost" open={expanded} onOpenChange={(next) => { setVisited(true); setExpanded(next); }}>
      <Collapsible.Trigger
        accessibilityLabel={disclosureAccessibleLabel(label, detail, expanded)}
        aria-expanded={expanded}
        style={{
          minHeight: metrics.touchTarget,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingVertical: space.sm,
          ...(grouped ? { paddingHorizontal: space.sm, marginHorizontal: -space.sm } : {}),
        }}
      >
        <View style={[uiStyles.grow, { gap: space.xxs }]}>
          <Body style={[uiStyles.label, tone && { color: semanticColors[tone].text }]}>
            {label}
          </Body>
          {detail && !expanded ? (
            <Body muted style={uiStyles.caption}>
              {detail}
            </Body>
          ) : null}
        </View>
        <DisclosureChevron axis="down" expanded={expanded} color={colors.muted} />
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-0">
        {visited ? <View style={{ gap: space.md, paddingTop: space.sm, paddingBottom: space.lg }}>{children}</View> : null}
      </Collapsible.Content>
      {feedback ? <View style={{ paddingTop: expanded ? 0 : space.sm }}>{feedback}</View> : null}
    </Collapsible>
  );
}
