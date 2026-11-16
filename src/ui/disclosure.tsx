import { useMobileTheme } from "./theme";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { Collapsible } from "panelui-native/components/collapsible";
import { View } from "react-native";
import { Body } from "./typography";
import { metrics, space, type SemanticTone } from "./tokens";
import ChevronDown from "lucide-react-native/icons/chevron-down";

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
  return (
    <Collapsible variant="ghost" open={expanded} onOpenChange={(next) => { setVisited(true); setExpanded(next); }}>
      <Collapsible.Trigger
        accessibilityLabel={label}
        aria-expanded={expanded}
        hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
        style={{
          minHeight: metrics.touchTarget,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingVertical: 3,
        }}
      >
        <View style={[uiStyles.grow, { gap: 2 }]}>
          <Body style={[uiStyles.buttonLabel, { fontWeight: "500" }, tone && { color: semanticColors[tone].text }]}>
            {label}
          </Body>
          {detail && !expanded ? (
            <Body muted style={uiStyles.caption}>
              {detail}
            </Body>
          ) : null}
        </View>
        <Collapsible.Indicator><ChevronDown size={16} color={colors.muted} /></Collapsible.Indicator>
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-0" style={{ paddingTop: expanded ? space.sm : 0, paddingBottom: space.sm }}>
        {visited ? children : null}
      </Collapsible.Content>
      {feedback ? <View style={{ paddingTop: expanded ? 0 : space.sm }}>{feedback}</View> : null}
    </Collapsible>
  );
}
