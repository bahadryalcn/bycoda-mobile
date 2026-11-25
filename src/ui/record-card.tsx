import { useState, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Circle from "lucide-react-native/icons/circle";
import CircleCheck from "lucide-react-native/icons/circle-check";
import { Card } from "./layout";
import { Body } from "./typography";
import { metrics, opacity, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { recordSpokenLabel } from "./record-card-label";
import { ActionMenu } from "./overflow-menu";
import { StatusLine } from "./feedback";
import { useCopy } from "./copy";
import { errorMessage } from "./error-message";
import { useRecordActionsSheet, type RecordActions } from "./record-actions";

export type { RecordActions };

/**
 * One record row: title, status and metadata, with at most ONE level of disclosure.
 * Pressing the identity opens `details`; commands in `menu`/`footer` stay separate
 * touch targets. `details` is a flat body: never put a Disclosure or another
 * expandable inside it, lay sections out with a plain label instead.
 * A details render function receives visibility so retained content can pause background work.
 *
 * `actions` are the record's options: the trailing "…" button and a long press on the identity
 * open the same list (screen readers get it as the identity's long-press action). `menu` holds
 * direct commands (Stop, Run now) placed before the "…" button.
 *
 * `issues` are persistent record failures (last run error, merge error): each is one quiet danger
 * line under the status; the full text is shown when the record is expanded. Keep `ErrorNotice`
 * for failures of an action the user just triggered.
 *
 * `hint` is announced as the accessibility hint and makes the identity carry an explicit spoken
 * label (title, status, metadata), so pass `statusLabel` whenever `status` is not a plain string.
 */
export function RecordCard({
  title, status, statusLabel, metadata, menu, actions, issues, selection, details, preview, footer, defaultExpanded = false, children, hint,
}: PropsWithChildren<{
  title: string;
  hint?: string;
  status?: ReactNode;
  statusLabel?: string;
  metadata?: string;
  menu?: ReactNode;
  actions?: RecordActions;
  issues?: readonly unknown[];
  /** Selection mode of the list: a press toggles the row, and row commands step aside. */
  selection?: { selected: boolean; onToggle: () => void };
  details?: ReactNode | ((expanded: boolean) => ReactNode);
  preview?: ReactNode;
  footer?: ReactNode;
  defaultExpanded?: boolean;
}>) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const options = useRecordActionsSheet(actions, title);
  const problems = (issues ?? []).filter((issue) => issue !== undefined && issue !== null && issue !== false && issue !== "")
    .map((issue) => errorMessage(issue, copy));
  const expandable = !!details || problems.length > 0;
  const { fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visited, setVisited] = useState(defaultExpanded);
  const [seenDefault, setSeenDefault] = useState(defaultExpanded);
  if (seenDefault !== defaultExpanded) {
    setSeenDefault(defaultExpanded);
    if (defaultExpanded) { setExpanded(true); setVisited(true); }
  }
  const toggle = () => {
    if (!expandable) return;
    setExpanded((value) => !value);
    setVisited(true);
  };
  const selecting = !!selection;
  const commands = !selecting;
  const identity = selection ? (
    <Pressable
      onPress={selection.onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={recordSpokenLabel({ title, status: statusLabel ?? (typeof status === "string" ? status : undefined), metadata })}
      accessibilityState={{ checked: selection.selected }}
      style={({ pressed }) => ({
        minHeight: metrics.rowHeightSession,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.md,
        paddingVertical: space.xs,
        flexGrow: 1, flexShrink: 1, flexBasis: 160 * Math.max(1, fontScale),
        minWidth: "auto",
        maxWidth: "100%",
        opacity: pressed ? opacity.pressed : 1,
      })}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ paddingTop: 1 }}>
        {selection.selected
          ? <CircleCheck size={22} strokeWidth={2} color={colors.accent} />
          : <Circle size={22} strokeWidth={1.75} color={colors.muted} />}
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 * Math.max(1, fontScale), minWidth: "auto", gap: space.xs }}>
        <Body selectable={false} style={uiStyles.title}>{title}</Body>
        {status || metadata ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            {status}
            {metadata ? <Body muted selectable={false} style={[uiStyles.caption, { flexShrink: 1 }]}>{metadata}</Body> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  ) : (
    <Pressable
      disabled={!expandable && !options.available}
      onPress={expandable ? toggle : undefined}
      onLongPress={options.available ? options.open : undefined}
      delayLongPress={400}
      accessibilityRole={expandable ? "button" : undefined}
      accessibilityLabel={hint ? recordSpokenLabel({ title, status: statusLabel ?? (typeof status === "string" ? status : undefined), metadata }) : undefined}
      accessibilityHint={hint}
      accessibilityState={expandable ? { expanded } : undefined}
      accessibilityActions={options.available && actions ? [{ name: "longpress", label: actions.label }] : undefined}
      onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === "longpress") options.open(); }}
      style={({ pressed }) => ({
        minHeight: metrics.rowHeightSession,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.sm,
        paddingVertical: space.xs,
        flexGrow: 1, flexShrink: 1, flexBasis: 160 * Math.max(1, fontScale),
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
      {expandable ? (
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
        {identity}
        {commands && (menu || options.available) ? (
          <View style={{ marginStart: "auto", flexShrink: 1, maxWidth: "100%", alignSelf: "flex-start", flexDirection: "row", alignItems: "flex-start" }}>
            {menu}
            {actions && options.available ? <ActionMenu label={actions.label} subtitle={actions.subtitle ?? title} actions={actions.items} busy={actions.busy} /> : null}
          </View>
        ) : null}
      </View>
      {problems.length && (!expanded || selecting) ? (
        <View style={{ gap: space.xxs, paddingTop: space.xs }}>
          {problems.map((problem, index) => <StatusLine key={index} tone="danger" label={problem} />)}
        </View>
      ) : null}
      {!expanded && preview ? <View style={{ paddingTop: space.xs }}>{preview}</View> : null}
      {children && commands ? <View style={{ gap: space.md, paddingTop: space.sm }}>{children}</View> : null}
      {visited && expandable ? (
        <View style={{ display: expanded && commands ? "flex" : "none", gap: space.sm, paddingTop: space.sm }}>
          {problems.map((problem, index) => (
            <Body key={index} style={[uiStyles.caption, { color: semanticColors.danger.text }]}>{problem}</Body>
          ))}
          {typeof details === "function" ? details(expanded) : details}
        </View>
      ) : null}
      {footer && commands ? <View style={{ gap: space.sm, paddingTop: space.sm }}>{footer}</View> : null}
      {commands ? options.sheet : null}
    </Card>
  );
}
