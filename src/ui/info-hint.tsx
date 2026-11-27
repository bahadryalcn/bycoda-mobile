import { useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps, type StyleProp, type TextStyle } from "react-native";
import Animated from "react-native-reanimated";
import Info from "lucide-react-native/icons/info";
import { Body } from "./typography";
import { reveal } from "./motion";
import { Hint } from "./hint";
import { useMobileTheme } from "./theme";
import { hitSlopFor, metrics, space } from "./tokens";
import { SectionHeader } from "./layout";
import { useCopy } from "./copy";

const GLYPH = 18;
/** A label beside an info icon or trailing control grows into the row's free width and wraps there. */
export const LABEL_IN_ROW = { flexGrow: 1, flexShrink: 1, minWidth: 0 } as const;
type HelpPresentation = "tooltip" | "inline" | "visible";

/** A short unit-like hint ("0 = unlimited", "0–59") stays visible; a sentence goes behind the icon. */
export const isUnitHint = (text?: string): text is string => !!text && text.length <= 28 && !/[.!?:]$/.test(text);

/** Caption for a unit-like hint, placed under the control. Sentences never render here. */
export function UnitHint({ hint }: { hint?: string }) {
  const { uiStyles } = useMobileTheme();
  return isUnitHint(hint) ? <Body muted style={uiStyles.caption}>{hint}</Body> : null;
}

/**
 * The info icon button. Its spoken name says what it explains ("Information about Timeout"); the
 * explanation itself is the accessibility hint, since the tooltip content is hidden from the a11y tree.
 * `compact` draws a 32 visual (48 through hitSlop) so a section header keeps its 32 row.
 */
function InfoButton({ text, subject, expanded, compact, onPress }: {
  text: string;
  subject?: string;
  expanded?: boolean;
  compact?: boolean;
  onPress?: PressableProps["onPress"];
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const side = compact ? metrics.visualControl : metrics.touchTarget;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subject ? copy("{p0} hakkında bilgi", "Information about {p0}", { p0: subject }) : copy("Bilgi", "Information")}
      accessibilityHint={text}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      aria-expanded={expanded}
      hitSlop={compact ? hitSlopFor(metrics.visualControl) : undefined}
      onPress={onPress}
      style={{ width: side, height: side, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <Info size={GLYPH} strokeWidth={2} color={expanded ? colors.accent : colors.muted} />
    </Pressable>
  );
}

/**
 * A dedicated information icon opens the actual explanation as a touch tooltip. Pass `subject` (the
 * field or section it explains) so the button has a short name; `compact` fits a 32 header row.
 */
export function InfoHint({ text, subject, compact }: { text: string; subject?: string; compact?: boolean }) {
  return (
    <Hint label={text} openOn="press">
      <InfoButton text={text} subject={subject} compact={compact} />
    </Hint>
  );
}

/** Optional tips open over the layout. Reading material can expand or stay visible. */
export function useInfoHint(text: string | undefined, presentation: HelpPresentation = "tooltip",
  options: { subject?: string; compact?: boolean } = {}) {
  const { uiStyles } = useMobileTheme();
  const [open, setOpen] = useState(false);
  if (!text) return { button: null, panel: null };
  if (presentation === "tooltip") return { button: <InfoHint text={text} subject={options.subject} compact={options.compact} />, panel: null };
  const detail = <Body muted style={uiStyles.caption}>{text}</Body>;
  if (presentation === "visible") return { button: null, panel: detail };
  return {
    button: <InfoButton text={text} subject={options.subject} compact={options.compact} expanded={open} onPress={() => setOpen((value) => !value)} />,
    panel: open ? <Animated.View entering={reveal}>{detail}</Animated.View> : null,
  };
}

/** Field label with optional contextual help. */
export function HintLabel({ label, help, always, style, trailing, presentation }: {
  label: string; help?: string; /** Reveal even a short text behind the icon (an explicit info prop). */ always?: boolean;
  style?: StyleProp<TextStyle>; trailing?: ReactNode; presentation?: HelpPresentation;
}) {
  const { uiStyles } = useMobileTheme();
  const info = useInfoHint(!presentation && !always && isUnitHint(help) ? undefined : help, presentation, { subject: label });
  const labelStyle = style ?? uiStyles.fieldLabel;
  const text = <Body selectable={false} style={labelStyle}>{label}</Body>;
  // A label alone uses the full field width so Android can measure wrapped text in the column.
  if (!info.button && !trailing) return info.panel ? <View style={{ gap: space.xxs }}>{text}{info.panel}</View> : text;
  return (
    <View style={{ gap: space.xxs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {/* Android measured a shrink-only label at its one-line width, then drew it a hair wider: the text
            wrapped inside that box and lost its second line ("Acil" with the icon floating after it). The
            label takes the row's free width instead, like ToggleField, and the icon ends the row. */}
        <Body selectable={false} style={[labelStyle, LABEL_IN_ROW]}>{label}</Body>
        {info.button}
        {trailing}
      </View>
      {info.panel}
    </View>
  );
}

/** A titled section with contextual help in its header. */
export function HintSection({ title, help, children, presentation }: {
  title: string;
  help?: string;
  children?: ReactNode;
  presentation?: HelpPresentation;
}) {
  // The compact info button keeps the 32 header row; the header's own gap spaces the content.
  const info = useInfoHint(help, presentation, { subject: title, compact: true });
  return (
    <View>
      <SectionHeader flush title={title} trailing={info.button} />
      {info.panel ? <View style={{ paddingBottom: space.sm }}>{info.panel}</View> : null}
      {children}
    </View>
  );
}
