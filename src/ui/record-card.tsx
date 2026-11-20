import { useState, type PropsWithChildren, type ReactNode, type ReactElement } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { Card } from "./layout";
import { Body } from "./typography";
import { metrics, opacity, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { Hint } from "./hint";
import { recordSpokenLabel } from "./record-card-label";

function RecordIdentity({ hint, style, children }: { hint?: string; style: ViewStyle; children: ReactElement<any> }) {
  return hint ? <View style={style}><Hint label={hint} stretch>{children}</Hint></View> : children;
}

/**
 * One record row: title, status and metadata, with at most ONE level of disclosure.
 * Pressing the identity opens `details`; commands in `menu`/`footer` stay separate
 * touch targets. `details` is a flat body: never put a Disclosure or another
 * expandable inside it, lay sections out with a plain label instead.
 * A details render function receives visibility so retained content can pause background work.
 *
 * `hint` is the long-press explanation and is announced as the accessibility hint. A `hint` makes
 * the identity carry an explicit spoken label (title, status, metadata), so pass `statusLabel`
 * whenever `status` is not a plain string; without a `hint` the visible text is read as is.
 */
export function RecordCard({
  title, status, statusLabel, metadata, menu, details, preview, footer, defaultExpanded = false, children, hint,
}: PropsWithChildren<{
  title: string;
  hint?: string;
  status?: ReactNode;
  statusLabel?: string;
  metadata?: string;
  menu?: ReactNode;
  details?: ReactNode | ((expanded: boolean) => ReactNode);
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
  const toggle = () => {
    if (!details) return;
    setExpanded((value) => !value);
    setVisited(true);
  };
  const identity = (
    <Pressable
      disabled={!details}
      onPress={toggle}
      accessibilityRole={details ? "button" : undefined}
      accessibilityLabel={hint ? recordSpokenLabel({ title, status: statusLabel ?? (typeof status === "string" ? status : undefined), metadata }) : undefined}
      accessibilityHint={hint}
      accessibilityState={details ? { expanded } : undefined}
      style={({ pressed }) => ({
        minHeight: metrics.rowHeightSession,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.sm,
        paddingVertical: space.xs,
        ...(hint ? { width: "100%" } : { flexGrow: 1, flexShrink: 1, flexBasis: 160 * Math.max(1, fontScale) }),
        minWidth: "auto",
        maxWidth: "100%",
        opacity: pressed ? opacity.pressed : 1,
      })}
    >
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 * Math.max(1, fontScale), minWidth: "auto", gap: space.xs }}>
        <Body selectable={false} style={uiStyles.title}>{title}</Body>
        {status || metadata ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            {status}
            {metadata ? <Body muted selectable={false} style={[uiStyles.caption, { flexShrink: 1 }]}>{metadata}</Body> : null}
          </View>
        ) : null}
      </View>
      {details ? (
        <View style={{ flexShrink: 0, minHeight: 24, justifyContent: "center",
          transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChevronDown size={16} color={colors.muted} />
        </View>
      ) : null}
    </Pressable>
  );
  return (
    <Card style={{ gap: 0, paddingVertical: space.md, paddingHorizontal: 0, borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: space.xs }}>
        <RecordIdentity hint={hint} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160 * Math.max(1, fontScale), minWidth: "auto", maxWidth: "100%" }}>
          {identity}
        </RecordIdentity>
        {menu ? <View style={{ marginStart: "auto", flexShrink: 1, maxWidth: "100%", alignSelf: "flex-start" }}>{menu}</View> : null}
      </View>
      {!expanded && preview ? <View style={{ paddingTop: space.xs }}>{preview}</View> : null}
      {children ? <View style={{ gap: space.md, paddingTop: space.sm }}>{children}</View> : null}
      {visited && details ? (
        <View style={{ display: expanded ? "flex" : "none", gap: space.sm, paddingTop: space.sm }}>
          {typeof details === "function" ? details(expanded) : details}
        </View>
      ) : null}
      {footer ? <View style={{ gap: space.sm, paddingTop: space.sm }}>{footer}</View> : null}
    </Card>
  );
}
