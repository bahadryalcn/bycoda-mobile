import { Inbox as DuotoneInbox, Info as DuotoneInfo, CircleCheck as DuotoneCircleCheck, TriangleAlert as DuotoneTriangleAlert, CircleAlert as DuotoneCircleAlert } from "./duotone-icon";
import { View } from "react-native";
import { EmptyState } from "panelui-native/components/empty-state";
import Inbox from "lucide-react-native/icons/inbox";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { Body, Heading } from "./typography";
import { Button } from "./buttons";
import { Illustration } from "./illustrations";
import { useMobileTheme } from "./theme";
import type { StateAction, StateTone, StateViewProps } from "./component-props";

const toneIcons = { neutral: Inbox, info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

const regionIcons = { neutral: DuotoneInbox, info: DuotoneInfo, success: DuotoneCircleCheck, warning: DuotoneTriangleAlert, danger: DuotoneCircleAlert };

function toneColors(tone: StateTone, { colors, semanticColors }: Pick<ReturnType<typeof useMobileTheme>, "colors" | "semanticColors">) {
  return tone === "neutral"
    ? { text: colors.muted, surface: colors.raised, border: colors.border }
    : semanticColors[tone];
}

function ActionButton({ action, tone, primary, inline = false }: { action: StateAction; tone: "primary" | "quiet"; primary: boolean; inline?: boolean }) {
  const { uiStyles } = useMobileTheme();
  return (
    <Button
      label={action.label}
      onPress={action.onPress}
      busy={action.busy}
      tone={tone}
      style={inline ? undefined : primary ? uiStyles.stateAction : uiStyles.stateSecondaryAction}
    />
  );
}

/**
 * The one presentation for a state that owns its region: empty, first run, not connected,
 * unreachable, locked or a failed load with no data. Centered in the available space; give the
 * parent `flex: 1` (or a scroller with `flexGrow: 1`) so it can center vertically.
 */
export function StateView({
  illustration, title, description, action, secondaryAction, compact = false, tone = "neutral", testID,
}: StateViewProps) {
  const theme = useMobileTheme();
  const { uiStyles } = theme;
  const inline = compact;
  const Icon = (inline ? toneIcons : regionIcons)[tone];
  const palette = toneColors(tone, theme);
  const text = (
    <>
      <Heading style={[uiStyles.stateTitle, inline && { textAlign: "left", fontSize: uiStyles.title.fontSize, lineHeight: uiStyles.title.lineHeight }]}>
        {title}
      </Heading>
      {description ? (
        <Body style={[uiStyles.stateDescription, inline && { textAlign: "left" }]}>{description}</Body>
      ) : null}
    </>
  );
  if (inline)
    return (
      <View testID={testID} style={uiStyles.stateInline}>
        <Icon size={20} strokeWidth={2} color={palette.text} style={{ marginTop: 1 }} />
        <View style={[uiStyles.grow, { gap: 4, alignItems: "flex-start" }]}>
          {text}
          {action ? <View style={{ marginTop: 8 }}><ActionButton action={action} tone="primary" primary={false} inline /></View> : null}
          {secondaryAction ? <ActionButton action={secondaryAction} tone="quiet" primary={false} inline /> : null}
        </View>
      </View>
    );
  return (
    <EmptyState
      testID={testID}
      className="gap-0 p-0"
      style={uiStyles.stateRegion}
    >
      <EmptyState.Header style={uiStyles.stateColumn}>
        {illustration ? (
          <Illustration name={illustration} size={168} />
        ) : (
          <View accessible={false} style={[uiStyles.stateIconTile, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Icon size={24} strokeWidth={1.75} color={palette.text} />
          </View>
        )}
        <View style={{ gap: 6, alignItems: "center", marginTop: 8 }}>{text}</View>
      </EmptyState.Header>
      {action || secondaryAction ? (
        <EmptyState.Content style={[uiStyles.stateActions, { maxWidth: uiStyles.stateColumn.maxWidth, width: "100%" }]}>
          {action ? <ActionButton action={action} tone="primary" primary /> : null}
          {secondaryAction ? <ActionButton action={secondaryAction} tone="quiet" primary={false} /> : null}
        </EmptyState.Content>
      ) : null}
    </EmptyState>
  );
}
