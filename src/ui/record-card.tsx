import { useState, type PropsWithChildren, type ReactNode, type ReactElement } from "react";
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { Accordion } from "panelui-native/components/accordion";
import { Card } from "./layout";
import { Body } from "./typography";
import { metrics, opacity, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { Hint } from "./hint";

function RecordIdentity({ hint, style, children }: { hint?: string; style: ViewStyle; children: ReactElement<any> }) {
  return hint ? <View style={style}><Hint label={hint} stretch>{children}</Hint></View> : children;
}

/** A record's title opens its details; commands remain separate touch targets. */
export function RecordCard({
  title, status, metadata, menu, details, preview, footer, defaultExpanded = false, children, hint,
}: PropsWithChildren<{
  title: string;
  hint?: string;
  status?: ReactNode;
  metadata?: string;
  menu?: ReactNode;
  details?: ReactNode;
  preview?: ReactNode;
  footer?: ReactNode;
  defaultExpanded?: boolean;
}>) {
  const { colors, uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visited, setVisited] = useState(defaultExpanded);
  const [seenDefault, setSeenDefault] = useState(defaultExpanded);
  if (seenDefault !== defaultExpanded) {
    setSeenDefault(defaultExpanded);
    if (defaultExpanded) { setExpanded(true); setVisited(true); }
  }
  return (
    <Card style={{ gap: 0, paddingVertical: space.md, paddingHorizontal: 0,
      borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: space.xs }}>
            <RecordIdentity hint={hint} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160 * Math.max(1, fontScale), minWidth: "auto", maxWidth: "100%" }}>
            <Accordion.Trigger
              disabled={!details}
              accessibilityLabel={hint ? `${title}. ${hint}` : undefined}
              aria-expanded={details ? expanded : undefined}
              className="gap-ui-sm py-ui-xs"
              style={({ pressed }) => ({
                minHeight: metrics.rowHeightSession,
                flexGrow: hint ? undefined : 1,
                flexShrink: hint ? undefined : 1,
                flexBasis: hint ? undefined : 160 * Math.max(1, fontScale),
                width: hint ? "100%" : undefined,
                minWidth: "auto",
                maxWidth: "100%",
                flexWrap: "wrap",
                opacity: pressed ? opacity.pressed : 1,
              })}
            >
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 * Math.max(1, fontScale),
                minWidth: "auto", maxWidth: "100%", gap: space.xs }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                  <Body selectable={false} style={[uiStyles.title, { flexShrink: 1, flexGrow: 1 }]}>{title}</Body>
                  {details ? <View style={{ flexShrink: 0, minHeight: 24, justifyContent: "center" }}>
                    <Accordion.Indicator accessible={false} accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants" />
                  </View> : null}
                </View>
                {status || metadata ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
                    {status}
                    {metadata ? <Body muted selectable={false} style={[uiStyles.caption, { flexShrink: 1 }]}>{metadata}</Body> : null}
                  </View>
                ) : null}
              </View>
            </Accordion.Trigger>
            </RecordIdentity>
            {menu ? <View style={{ marginStart: "auto", flexShrink: 1, maxWidth: "100%", alignSelf: "flex-start" }}>{menu}</View> : null}
          </View>
          {!expanded && preview ? <View style={{ paddingTop: space.xs }}>{preview}</View> : null}
          {children ? <View style={{ gap: space.md, paddingTop: space.sm }}>{children}</View> : null}
          {visited && details ? (
            <Accordion.Content keepMounted className="px-0 pb-0">
              <View style={{ gap: space.sm, paddingTop: space.md, paddingBottom: space.sm,
                marginTop: space.xs }}>
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
