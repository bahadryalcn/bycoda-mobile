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
import { StatusLine } from "./status-line";
import { useMobileTheme } from "./theme";
import { isErrorArt, resolveStateSize } from "./state-model";
import { iconSize, space } from "./tokens";
import type { StateAction, StateTone, StateViewProps } from "./component-props";

/** Region art (first run, unpaired, empty) keeps one size in every state region. */
const ILLUSTRATION_SIZE = 168;
/** Tone glyph inside the 48 region icon tile (`uiStyles.stateIconTile`). */
const REGION_ICON_SIZE = 22;

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
      reserveTouchTarget={action.reserveTouchTarget}
      tone={tone}
      density={inline ? "compact" : undefined}
      style={inline ? undefined : primary ? uiStyles.stateAction : uiStyles.stateSecondaryAction}
    />
  );
}

/**
 * The one presentation for a state: empty, first run, not connected, unreachable, locked or a
 * failed load with no data. `region` centers in the available space (give the parent `flex: 1`
 * or a scroller with `flexGrow: 1`); `compact` is an icon row for a section; `line` is one status
 * line. Illustrations are for first run, unpaired and empty only: error art (error, unreachable,
 * offline, locked) is drawn as the small tone icon so an error region stays within 200 pt.
 */
export function StateView({
  illustration, title, description, action, secondaryAction, compact = false, size, tone = "neutral", testID,
}: StateViewProps) {
  const theme = useMobileTheme();
  const { uiStyles } = theme;
  const resolved = resolveStateSize(size, compact);
  if (resolved === "line")
    return <View testID={testID}><StatusLine tone={tone} label={title} action={action} /></View>;
  const art = illustration && !isErrorArt(illustration) ? illustration : undefined;
  const inline = resolved === "compact";
  const Icon = (inline ? toneIcons : regionIcons)[tone];
  const palette = toneColors(tone, theme);
  // A region title is a heading; a section's inline state reads as a row, so it is not announced as one.
  const Title = inline ? Body : Heading;
  const text = (
    <>
      <Title style={[uiStyles.stateTitle, inline && (tone === "neutral" ? uiStyles.stateInlineQuiet : uiStyles.stateInlineTitle)]}>
        {title}
      </Title>
      {description ? (
        <Body accessibilityLabel={description} numberOfLines={inline ? 2 : art ? undefined : 3}
          style={[uiStyles.stateDescription, inline && uiStyles.stateInlineDescription]}>{description}</Body>
      ) : null}
    </>
  );
  // A section state reads like a row: a neutral one (empty) is quiet text, a toned one leads with
  // its 16dp status glyph. No inbox art, no bold line, aligned with the section's rows.
  if (inline)
    return (
      <View testID={testID} style={uiStyles.stateInline}>
        {tone === "neutral" ? null : <Icon size={iconSize.status} strokeWidth={2} color={palette.text} style={{ marginTop: 2 }} />}
        <View style={[uiStyles.grow, { gap: space.xxs, alignItems: "flex-start" }]}>
          {text}
          {action || secondaryAction ? (
            <View style={{ marginTop: space.xs, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
              {action ? <ActionButton action={action} tone="primary" primary={false} inline /> : null}
              {secondaryAction ? <ActionButton action={secondaryAction} tone="quiet" primary={false} inline /> : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  return (
    <EmptyState
      testID={testID}
      className="gap-0 p-0"
      style={[uiStyles.stateRegion, art && uiStyles.stateRegionArt]}
    >
      <EmptyState.Header style={uiStyles.stateColumn}>
        {art ? (
          <Illustration name={art} size={ILLUSTRATION_SIZE} />
        ) : (
          <View accessible={false} style={[uiStyles.stateIconTile, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Icon size={REGION_ICON_SIZE} strokeWidth={1.75} color={palette.text} />
          </View>
        )}
        {/* The text spans the column and centers itself: shrink-to-fit text was measured narrower
            than Android draws it, so a short title ("Açık sayfa yok") wrapped its last word and clipped it. */}
        <View style={{ gap: space.sm, alignSelf: "stretch", alignItems: "stretch", marginTop: art ? space.sm : space.xs }}>{text}</View>
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
