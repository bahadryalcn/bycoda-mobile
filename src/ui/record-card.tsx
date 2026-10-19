import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { View } from "react-native";
import { Accordion } from "panelui-native/components/accordion";
import { Card } from "./layout";
import { Body } from "./typography";
import { colors, metrics, opacity, space } from "./tokens";
import { uiStyles } from "./styles";
import { useMobileTheme } from "./theme";

/** A record's title opens its details; commands remain separate touch targets. */
export function RecordCard({
  title, status, metadata, menu, details, preview, footer, defaultExpanded = false, children,
}: PropsWithChildren<{
  title: string;
  status?: ReactNode;
  metadata?: string;
  menu?: ReactNode;
  details?: ReactNode;
  preview?: ReactNode;
  footer?: ReactNode;
  defaultExpanded?: boolean;
}>) {
  useMobileTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visited, setVisited] = useState(defaultExpanded);
  useEffect(() => {
    if (defaultExpanded) { setExpanded(true); setVisited(true); }
  }, [defaultExpanded]);
  return (
    <Card style={{ gap: 0 }}>
      <Accordion
        variant="ghost"
        hideSeparator
        value={expanded ? "details" : ""}
        onValueChange={(value) => {
          setExpanded(value === "details");
          if (value === "details") setVisited(true);
        }}
        className="overflow-visible"
      >
        <Accordion.Item value="details" className="overflow-visible">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
            <Accordion.Trigger
              disabled={!details}
              aria-expanded={details ? expanded : undefined}
              className="flex-1 min-w-0 gap-ui-sm py-ui-xs"
              style={({ pressed }) => ({
                minHeight: metrics.touchTarget,
                opacity: pressed ? opacity.pressed : 1,
              })}
            >
              <View style={[uiStyles.grow, { gap: space.xs }]}>
                <Body selectable={false} style={uiStyles.title}>{title}</Body>
                {status || metadata ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
                    {status}
                    {metadata ? <Body muted selectable={false} style={uiStyles.caption}>{metadata}</Body> : null}
                  </View>
                ) : null}
              </View>
              {details ? <Accordion.Indicator accessible={false} accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants" style={{ flexShrink: 0 }} /> : null}
            </Accordion.Trigger>
            {menu}
          </View>
          {!expanded && preview ? <View style={{ paddingTop: space.xs }}>{preview}</View> : null}
          {children ? <View style={{ gap: space.sm, paddingTop: space.xs }}>{children}</View> : null}
          {visited && details ? (
            <Accordion.Content keepMounted className="px-0 pb-0">
              <View style={{ gap: space.sm, paddingTop: space.md, paddingBottom: space.sm,
                borderTopWidth: 1, borderTopColor: colors.separator, marginTop: space.sm }}>
                {details}
              </View>
            </Accordion.Content>
          ) : null}
        </Accordion.Item>
      </Accordion>
      {footer ? <View style={{ gap: space.sm, paddingTop: space.sm }}>{footer}</View> : null}
    </Card>
  );
}
