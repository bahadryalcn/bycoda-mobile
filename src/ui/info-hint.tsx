import { useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps, type StyleProp, type TextStyle } from "react-native";
import Animated from "react-native-reanimated";
import Info from "lucide-react-native/icons/info";
import { Body } from "./typography";
import { reveal } from "./motion";
import { Hint } from "./hint";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";
import { SectionHeader } from "./layout";

const GLYPH = 18;
type HelpPresentation = "tooltip" | "inline" | "visible";

/** A short unit-like hint ("0 = unlimited", "0–59") stays visible; a sentence goes behind the icon. */
export const isUnitHint = (text?: string): text is string => !!text && text.length <= 28 && !/[.!?:]$/.test(text);

/** Caption for a unit-like hint, placed under the control. Sentences never render here. */
export function UnitHint({ hint }: { hint?: string }) {
  const { uiStyles } = useMobileTheme();
  return isUnitHint(hint) ? <Body muted style={uiStyles.caption}>{hint}</Body> : null;
}

function InfoButton({ text, expanded, onPress }: {
  text: string;
  expanded?: boolean;
  onPress?: PressableProps["onPress"];
}) {
  const { colors } = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      aria-expanded={expanded}
      onPress={onPress}
      style={{ width: metrics.touchTarget, height: metrics.touchTarget, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <Info size={GLYPH} strokeWidth={2} color={expanded ? colors.accent : colors.muted} />
    </Pressable>
  );
}

/** A dedicated information icon opens the actual explanation as a touch tooltip. */
export function InfoHint({ text }: { text: string }) {
  return (
    <Hint label={text} openOn="press">
      <InfoButton text={text} />
    </Hint>
  );
}

/** Optional tips open over the layout. Reading material can expand or stay visible. */
export function useInfoHint(text: string | undefined, presentation: HelpPresentation = "tooltip") {
  const { uiStyles } = useMobileTheme();
  const [open, setOpen] = useState(false);
  if (!text) return { button: null, panel: null };
  if (presentation === "tooltip") return { button: <InfoHint text={text} />, panel: null };
  const detail = <Body muted style={uiStyles.caption}>{text}</Body>;
  if (presentation === "visible") return { button: null, panel: detail };
  return {
    button: <InfoButton text={text} expanded={open} onPress={() => setOpen((value) => !value)} />,
    panel: open ? <Animated.View entering={reveal}>{detail}</Animated.View> : null,
  };
}

/** Field label with optional contextual help. */
export function HintLabel({ label, help, always, style, trailing, presentation }: {
  label: string; help?: string; /** Reveal even a short text behind the icon (an explicit info prop). */ always?: boolean;
  style?: StyleProp<TextStyle>; trailing?: ReactNode; presentation?: HelpPresentation;
}) {
  const { uiStyles } = useMobileTheme();
  const info = useInfoHint(!presentation && !always && isUnitHint(help) ? undefined : help, presentation);
  const labelStyle = style ?? uiStyles.fieldLabel;
  // A label alone uses the full field width so Android can measure wrapped text in the column.
  if (!info.button && !info.panel && !trailing) return <Body selectable={false} style={labelStyle}>{label}</Body>;
  return (
    <View style={{ gap: space.xxs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Body selectable={false} style={[labelStyle, { flexShrink: 1 }]}>{label}</Body>
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
  const info = useInfoHint(help, presentation);
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader flush title={title} trailing={info.button} />
      {info.panel}
      {children}
    </View>
  );
}
